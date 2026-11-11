#!/usr/bin/env node
// Error reports (src/errors.ts, lx/error-report.js, lx/error-clean.js) end to end, against a LOCAL server and its own state, in
// Chrome for Testing:
//   - the app sends what breaks (an uncaught error, one in our own module, an unhandled rejection), each once, at most 10 a page,
//     cleaned on the device: planted words, an address, a link with a query and a key never leave it (every request read);
//   - they're kept in D1 cleaned again, with the browser coarse, the screen by route names and the app's version;
//   - refused and never kept: another origin, no origin, not JSON, too big; always 204, no cookie set; GET is no route;
//   - the Worker's own: a 500 counted by its route's pattern (never the path asked for), an MCP tool's failure, the cron's;
//   - an admin reads them over MCP and clears one (logged); someone else never sees the tools;
//   - the Home Screen app on a phone starting again by itself (a reload it didn't make) is told once, with its screen and the app's
//     version only; a first open, the app's own Reload, a page last hidden, a browser tab and a computer's installed app aren't.
// The 500s come from tables this check drops in ITS OWN state (items, counter_notices), so it refuses any non-local URL.
//
//   node scripts/errors-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
// The server: wrangler dev with --test-scheduled (the cron's run at /__scheduled), GATE_ENABLED:false, PUBLIC_ORIGIN:http://localhost:<port>,
// RP_ID:localhost, after npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>. Sandbox off. Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [BASE_ARG, OUT_ARG] = process.argv.slice(2);
const PERSIST = process.argv[process.argv.indexOf("--persist-to") + 1];
if (!BASE_ARG || !OUT_ARG || !process.argv.includes("--persist-to") || !PERSIST) {
  console.error("usage: errors-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>");
  process.exit(2);
}
const BASE = BASE_ARG.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("errors-check drops tables in the server's state: a LOCAL server only.");
  process.exit(2);
}
const OUT = resolve(OUT_ARG);
mkdirSync(OUT, { recursive: true });

const results = [];
const log = [];
async function stage(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.message ?? error) });
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error).split("\n").join("\n      ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// Planted: what must never be kept or leave the device.
const SECRETS = ["Mijn geheim", "someone@example.com", "q=private", "sk-or-v1-0123456789abcdef0123", "0612345678"];
const leaked = (text) => SECRETS.filter((s) => text.includes(s));

// ---------- the local state ----------

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const wrangler = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sql = (command) => {
  const out = wrangler(["d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
function account(name, { admin = false } = {}) {
  const id = `err${run}${randomBytes(4).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const statements = [
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'errors-check')`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'errors-check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${admin ? 1 : 0})`,
  ];
  if (admin) statements.push(`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'errors-check')`);
  sql(statements.join("; "));
  return { id, cookie, token };
}
const groups = (where = "1") => sql(`SELECT * FROM error_groups WHERE ${where} ORDER BY first_seen`);
const hourCount = (source) => sql(`SELECT COALESCE(SUM(count), 0) AS n FROM error_hours WHERE source = ${q(source)}`)[0].n;

/** fetch from Node to the local server: a socket refused or closed under load ("fetch failed") is tried once more, and said. */
async function net(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    console.log(`      (${init?.method ?? "GET"} ${String(url).replace(BASE, "")}: ${error.message}${error.cause ? `, ${error.cause.code ?? error.cause.message}` : ""}; once more)`);
    return fetch(url, init);
  }
}

async function rpc(token, method, params) {
  const send = () =>
    fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  // A kept-alive connection the local server closed while the check read D1 fails once at the socket ("fetch failed"): once more.
  const response = await send().catch((error) => {
    console.log(`      (${method}: ${error.message}${error.cause ? `, ${error.cause.code ?? error.cause.message}` : ""}; once more)`);
    return send();
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
const toolNames = async (token) => (await rpc(token, "tools/list", {})).result.tools.map((t) => t.name);
async function tool(token, name, args = {}) {
  const { result, error } = await rpc(token, "tools/call", { name, arguments: args });
  log.push({ tool: name, args, error: error?.message ?? (result?.isError ? result.content[0].text : undefined) });
  if (error) return { error: error.message };
  if (result.isError) return { error: result.content[0].text };
  try {
    return JSON.parse(result.content[0].text);
  } catch {
    return result.content[0].text;
  }
}

const learner = account("Errors Learner");
const admin = account("Errors Admin", { admin: true });

// ---------- the browser ----------

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE, httpOnly: true, sameSite: "Lax" }]);
const outside = [];
await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => (outside.push(route.request().url()), route.abort()));
const page = await context.newPage();
const reports = [];
page.on("request", (r) => {
  if (r.url() === `${BASE}/api/errors`) reports.push({ method: r.method(), headers: r.headers(), body: r.postData() ?? "" });
});
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const settle = () => page.waitForTimeout(1500);

await stage("the app sends what breaks, each once, cleaned on the device", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
  // Code this check evaluates has no file of ours, so a report of only its frames is dropped as someone else's (an extension's).
  // Each plant runs inside our own module instead: error-clean.js's cleanStack calls the own() it's given, which throws.
  await page.evaluate(async () => {
    const m = await import("/js/lx/error-clean.js");
    const stack = "    at f (https://x/js/a.js:1:1)";
    const planted = () => m.cleanStack(stack, () => {
      throw new Error('Planted "Mijn geheim" for someone@example.com at https://lexicommons.com/app/?q=private, call 0612345678');
    });
    setTimeout(planted);
    setTimeout(planted); // the same error again: not sent twice
    setTimeout(() => m.cleanStack(stack, null)); // a TypeError of our module's own
    (async () => m.cleanStack(stack, () => {
      throw new TypeError('Rejected "Mijn geheim" with key sk-or-v1-0123456789abcdef0123');
    }))();
    // Only someone else's code: dropped on the device.
    setTimeout(() => {
      throw new Error("only the check's own frames");
    });
  });
  await settle();
  assert(pageErrors.length >= 5, `the page's own errors: ${JSON.stringify(pageErrors)}`);
  assert(reports.length === 3, `3 reports, got ${reports.length}: ${JSON.stringify(reports.map((r) => r.body))}`);
  for (const r of reports) {
    assert(r.method === "POST" && /^application\/json/.test(r.headers["content-type"] ?? ""), `sent as ${r.method} ${r.headers["content-type"]}`);
    assert(!leaked(r.body).length, `left the device: ${leaked(r.body)} in ${r.body}`);
  }
  const bodies = reports.map((r) => JSON.parse(r.body));
  const planted = bodies.find((b) => b.message.startsWith("Planted"));
  assert(planted?.message === 'Planted "…" for [email] at [link], call #', `planted: ${JSON.stringify(planted)}`);
  assert(!bodies.some((b) => b.message.includes("only the check's own frames")), "an error with no frame of ours was sent");
  const own = bodies.find((b) => b.name === "TypeError" && b.kind === "error");
  assert(own && /^(Module\.)?cleanStack \(\/js\/lx\/error-clean\.js:\d+:\d+\)/.test(own.stack), `our module's frame first: ${JSON.stringify(own)}`);
  assert(bodies.every((b) => /cleanStack \(\/js\/lx\/error-clean\.js:/.test(b.stack) && !/playwright|localhost/.test(b.stack)), `stacks: ${JSON.stringify(bodies.map((b) => b.stack))}`);
  const rejected = bodies.find((b) => b.kind === "rejection");
  assert(rejected?.message === 'Rejected "…" with key …', `rejection: ${JSON.stringify(rejected)}`);
  assert(bodies.every((b) => /^\d+$/.test(b.version) && /^\/app\/(#[a-z-]+(\/[a-z-]+)?)?$/.test(b.place)), `version and place: ${JSON.stringify(bodies.map((b) => [b.version, b.place]))}`);
  return bodies.map((b) => `${b.kind} ${b.name}: ${b.message}`).join(" | ");
});

await stage("at most 10 a page", async () => {
  await page.evaluate(async () => {
    const m = await import("/js/lx/error-clean.js");
    for (const word of "abcdefghijklmno") setTimeout(() => m.cleanStack("    at f (https://x/js/a.js:1:1)", () => {
      throw new Error(`distinct ${word.repeat(3)}`);
    }));
  });
  await settle();
  assert(reports.length === 10, `10 in all from this page, got ${reports.length}`);
  return `${reports.length} sent, 5 of the 15 distinct held back`;
});

await stage("kept in D1, cleaned again: browser coarse, screen by route names, the app's version", async () => {
  const rows = groups("source = 'client'");
  const dump = JSON.stringify(rows);
  writeFileSync(join(OUT, "client-groups.json"), JSON.stringify(rows, null, 2));
  assert(!leaked(dump).length, `kept: ${leaked(dump)}`);
  assert(rows.length === 10, `10 kinds, got ${rows.length}`);
  assert(rows.every((r) => /^Chrome \d+ · (macOS|Linux|Windows)$/.test(r.browser) && /^\d+$/.test(r.version) && r.count === 1), `fields: ${JSON.stringify(rows.map((r) => [r.browser, r.version, r.count]))}`);
  assert(hourCount("client") === 10, `the hour: ${hourCount("client")}`);
  const columns = Object.keys(rows[0]).sort().join(",");
  assert(columns === "browser,count,fingerprint,first_seen,kind,last_seen,message,name,place,source,stack,version", `columns ${columns}`);
  return `${rows.length} kinds; ${rows[0].browser}; place ${rows[0].place}; version ${rows[0].version}`;
});

await stage("refused and never kept: another origin, none, not JSON, too big; always 204, no cookie; GET is no route", async () => {
  const before = hourCount("client");
  const body = JSON.stringify({ kind: "error", name: "Error", message: "from outside", stack: "    at f (https://x/js/a.js:1:1)", place: "/app/", version: "1" });
  const tries = [
    ["another origin", { Origin: "https://evil.example", "Content-Type": "application/json" }, body],
    ["no origin", { "Content-Type": "application/json" }, body],
    ["not JSON", { Origin: BASE, "Content-Type": "text/plain" }, body],
    ["too big", { Origin: BASE, "Content-Type": "application/json" }, JSON.stringify({ message: "x".repeat(9000) })],
    ["junk JSON", { Origin: BASE, "Content-Type": "application/json" }, "[1,2"],
  ];
  for (const [what, headers, payload] of tries) {
    const r = await net(`${BASE}/api/errors`, { method: "POST", headers, body: payload });
    assert(r.status === 204 && !r.headers.get("set-cookie"), `${what}: ${r.status} ${r.headers.get("set-cookie") ?? ""}`);
  }
  assert(hourCount("client") === before, `kept one: ${hourCount("client")} vs ${before}`);
  const get = await net(`${BASE}/api/errors`);
  assert(get.status === 404 || get.status === 405, `GET: ${get.status}`);
  const fromHere = await net(`${BASE}/api/errors`, { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json; charset=utf-8" }, body });
  assert(fromHere.status === 204 && hourCount("client") === before + 1, `this site's: ${fromHere.status}, ${hourCount("client")}`);
  return `5 refused; GET ${get.status}; this site's kept`;
});

await stage("a 500 is counted by its route's pattern, never the path asked for", async () => {
  sql("DROP TABLE items");
  const status = await page.evaluate(async () => (await fetch("/api/community/items/Mijn-geheim-0612345678")).status);
  assert(status === 500, `status ${status}`);
  const rows = groups("source = 'server'");
  assert(rows.length === 1, `server rows: ${JSON.stringify(rows)}`);
  assert(rows[0].place === "GET /api/community/items/:id", `place ${rows[0].place}`);
  assert(rows[0].kind === "exception" && rows[0].message.length > 0, JSON.stringify(rows[0]));
  assert(!leaked(JSON.stringify(rows)).length && !JSON.stringify(rows).includes("Mijn-geheim"), `kept the path: ${JSON.stringify(rows)}`);
  return `${rows[0].name}: ${rows[0].message} at ${rows[0].place}; stack ${rows[0].stack.split("\n").length} frames`;
});

await stage("an MCP tool's failure is counted", async () => {
  const answer = await tool(admin.token, "explore_get", { id: "Mijn-geheim" });
  assert(/went wrong on Lexicommons' side/.test(answer.error ?? ""), `answer: ${JSON.stringify(answer)}`);
  const rows = groups("source = 'mcp'");
  assert(rows.length === 1 && rows[0].place === "mcp tool" && !JSON.stringify(rows).includes("Mijn"), JSON.stringify(rows));
  return `${rows[0].name}: ${rows[0].message}`;
});

await stage("the cron's failures are counted", async () => {
  sql("DROP TABLE counter_notices");
  const r = await net(`${BASE}/__scheduled?cron=${encodeURIComponent("*/15 * * * *")}`);
  assert(r.ok, `__scheduled: ${r.status} (is the server running with --test-scheduled?)`);
  let rows = [];
  for (let i = 0; i < 20 && !rows.length; i++) {
    await new Promise((done) => setTimeout(done, 500));
    rows = groups("source = 'cron'");
  }
  assert(rows.some((row) => row.place === "cron admin-alerts"), `cron rows: ${JSON.stringify(rows)}`);
  return rows.map((row) => `${row.place}: ${row.message}`).join(" | ");
});

await stage("an admin reads them over MCP and clears one; someone else never sees the tools", async () => {
  const learnerTools = await toolNames(learner.token);
  assert(!learnerTools.includes("error_reports") && !learnerTools.includes("error_reports_clear"), "a learner sees them");
  const adminTools = await toolNames(admin.token);
  assert(adminTools.includes("error_reports") && adminTools.includes("error_reports_clear"), "the admin doesn't");
  const view = await tool(admin.token, "error_reports", {});
  writeFileSync(join(OUT, "error-reports.json"), JSON.stringify(view, null, 2));
  assert(!view.error, view.error);
  const sources = new Set(view.groups.map((g) => g.source));
  for (const s of ["client", "server", "mcp", "cron"]) assert(sources.has(s), `no ${s} in ${[...sources]}`);
  assert(view.last_48_hours.length >= 1 && view.last_48_hours.at(-1).client >= 11, `hours: ${JSON.stringify(view.last_48_hours)}`);
  const onlyServer = await tool(admin.token, "error_reports", { source: "server" });
  assert(onlyServer.groups.every((g) => g.source === "server") && onlyServer.groups.length === 1, JSON.stringify(onlyServer.groups));
  const target = onlyServer.groups[0].fingerprint;
  const cleared = await tool(admin.token, "error_reports_clear", { fingerprints: [target], note: "errors-check" });
  assert(cleared.cleared === 1, JSON.stringify(cleared));
  assert(groups(`fingerprint = ${q(target)}`).length === 0, "still there");
  const logged = sql("SELECT action, target, note FROM admin_log WHERE action = 'errors.clear'");
  assert(logged.length === 1 && logged[0].target === target && logged[0].note === "errors-check", JSON.stringify(logged));
  const neither = await tool(admin.token, "error_reports_clear", {});
  assert(/Name the fingerprints/.test(neither.error ?? ""), JSON.stringify(neither));
  const asLearner = await tool(learner.token, "error_reports", {});
  assert(asLearner.error, `a learner read them: ${JSON.stringify(asLearner).slice(0, 200)}`);
  return `${view.kinds} kinds from ${[...sources].join(", ")}; cleared ${target}; logged`;
});

await stage("the Home Screen app started again by itself: told once, with its screen and version only; never otherwise", async () => {
  const { cleanPlace, RELOAD } = await import("../public/js/lx/error-clean.js");
  // A phone (touch, a coarse pointer) and the Home Screen app (navigator.standalone, as an iPhone's), or not.
  async function phone({ installed = true, touch = true } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
    await ctx.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE, httpOnly: true, sameSite: "Lax" }]);
    await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => (outside.push(route.request().url()), route.abort()));
    if (installed) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
    const tab = await ctx.newPage();
    const told = [];
    tab.on("request", (r) => {
      if (r.url() !== `${BASE}/api/errors`) return;
      const body = JSON.parse(r.postData() ?? "{}");
      if (body.kind === "reload") told.push(body);
    });
    tab.on("pageerror", (e) => pageErrors.push(e.message));
    const ready = async () => {
      await tab.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
      await tab.waitForTimeout(1500);
    };
    // The page ends as a phone ends it, then comes back: from that moment nothing it runs is kept (a page being unloaded marks itself
    // hidden, which a page that's simply gone never does), then the same address loads again as a reload. Chrome's own renderer crash
    // (CDP Page.crash) leaves Playwright's page unusable, so this is the crash's one trait the rule reads.
    const endAndReload = async () => {
      await tab.evaluate(() => {
        Storage.prototype.setItem = () => {};
        Storage.prototype.removeItem = () => {};
      });
      await tab.reload();
      await ready();
    };
    return { ctx, tab, told, ready, endAndReload };
  }
  const notes = [];

  const app = await phone();
  await app.tab.goto(`${BASE}/app/#explore`);
  await app.ready();
  const seen = await app.tab.evaluate(() => ({ coarse: matchMedia("(pointer: coarse)").matches, standalone: navigator.standalone === true }));
  assert(seen.coarse && seen.standalone, `the stand-in phone app: ${JSON.stringify(seen)}`);
  assert(!app.told.length, `a first open told: ${JSON.stringify(app.told)}`);
  // An ordinary reload: the page unloads, marking itself hidden on the way, so it isn't told (only a page that's simply gone is).
  await app.tab.reload();
  await app.ready();
  assert(!app.told.length, `an ordinary reload told: ${JSON.stringify(app.told)}`);
  const where = await app.tab.evaluate(() => location.pathname + location.hash);
  await app.endAndReload();
  assert(app.told.length === 1, `a reload by itself told ${app.told.length} times: ${JSON.stringify(app.told)}`);
  const [told] = app.told;
  assert(Object.keys(told).sort().join(",") === "kind,message,name,place,stack,version", `fields sent: ${Object.keys(told)}`);
  assert(told.message === RELOAD.message && told.name === RELOAD.name && told.stack === "" && told.place === cleanPlace(where) && /^\d+$/.test(told.version), `sent: ${JSON.stringify(told)}`);
  notes.push(`told from ${told.place}, v${told.version}`);

  // The app's own Reload (shell/new-version.js marks it first): nothing, and the mark is used up.
  await app.tab.evaluate(async () => (await import("/js/lx/error-report.js")).markOwnReload());
  await app.endAndReload();
  assert(app.told.length === 1, `the app's own Reload told: ${JSON.stringify(app.told.slice(1))}`);
  assert((await app.tab.evaluate(() => sessionStorage.getItem("lx.reload.own"))) === null, "the own-reload mark was left behind");
  // The control after it: a reload by itself again is told again (the mark was for one reload only).
  await app.endAndReload();
  assert(app.told.length === 2, `the next reload by itself: told ${app.told.length - 1} more`);

  // A page last seen hidden ended in the background: nothing.
  await app.tab.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await app.endAndReload();
  assert(app.told.length === 2, `a page last hidden told: ${JSON.stringify(app.told.slice(2))}`);
  await app.ctx.close();
  notes.push("own Reload, last hidden: none");

  for (const [what, options] of [["a browser tab on a phone", { installed: false }], ["a computer's installed app", { touch: false }]]) {
    const other = await phone(options);
    await other.tab.goto(`${BASE}/app/#explore`);
    await other.ready();
    await other.endAndReload();
    assert(!other.told.length, `${what} told: ${JSON.stringify(other.told)}`);
    await other.ctx.close();
    notes.push(`${what}: none`);
  }

  const rows = groups("kind = 'reload'");
  writeFileSync(join(OUT, "reload-groups.json"), JSON.stringify(rows, null, 2));
  assert(rows.length === 1 && rows[0].count === 2, `kept: ${JSON.stringify(rows)}`);
  assert(rows[0].message === RELOAD.message && rows[0].stack === "" && rows[0].place === told.place && rows[0].version === told.version, `row: ${JSON.stringify(rows[0])}`);
  return notes.join("; ");
});

await stage("nothing reached any other server", async () => {
  assert(!outside.length, outside.join(", "));
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, log }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `errors check: ${failed} of ${results.length} stages FAILED` : `errors check: all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
