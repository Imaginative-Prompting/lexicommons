// Error reports (src/errors.ts, public/js/lx/error-clean.js), in Node on the real migrations:
//   - cleaning: planted personal text (quoted words, addresses, links with queries, tokens, long numbers) never survives a message;
//     words of code do; stacks in V8's, Safari's and Firefox's formats keep only our own frames, without host or query; a browser
//     is its name, major version and system; a screen is its route names only;
//   - what's dropped: "Script error.", an extension's error, nothing to say; junk of any shape never throws;
//   - the store: the same error counted in one group (digits alike), the hour counted, the per-isolate limit holding writes back
//     and counting them later, the cap folding new kinds into one overflow row, the sweep, error_reports' view, clearing;
//   - a server error's record: the route's pattern, never the path; the Worker's frames; D1's overloaded held back while it lasts and
//     written as one counted group once D1 answers again (kept when D1 still refuses it);
//   - the spike alert (admin-alerts.ts): the floor and the times-the-usual rule, quiet hours, at most every 6 hours, counts only, and
//     the cron's run reaching an admin's device.
// `node scripts/test-errors.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { workerEnv } from "./fixtures/worker-env.mjs";

const clean = await import("../public/js/lx/error-clean.js");
const errors = await import("../src/errors.ts");
const { alertsDue, runAdminAlerts, ERROR_SPIKE } = await import("../src/admin-alerts.ts");
const { cleanMessage, cleanStack, coarseBrowser, cleanPlace, cleanReport, groupKey, appOwn, workerOwn, ERROR_LIMITS, RELOAD, startedAgainByItself } = clean;

let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.stack ?? error).split("\n").slice(0, 6).join("\n        ")}`);
  }
};

const SECRETS = ["ik woon in Utrecht", "Mijn geheim", "someone@example.com", "q=private", "token=abc", "sk-or-v1-0123456789abcdef0123", "0612345678", "lexicommons.com", "evil.example"];
const noSecret = (text) => {
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `"${secret}" survived in: ${text}`);
};

// ---------- cleaning ----------

await test("a message loses what could be someone's, and keeps the words of code", () => {
  const cases = [
    [`Unexpected token 'i', "ik woon in Utrecht" is not valid JSON`, `Unexpected token 'i', "…" is not valid JSON`],
    [`Cannot read properties of undefined (reading 'length')`, `Cannot read properties of undefined (reading 'length')`],
    [`No pack called “Mijn geheim” for someone@example.com`, `No pack called “…” for [email]`],
    [`Failed to fetch https://lexicommons.com/api/search?q=private&token=abc`, `Failed to fetch [link]`],
    [`at https://lexicommons.com/app/?q=private, then https://evil.example/x.`, `at [link], then [link].`],
    [`Failed to fetch dynamically imported module: https://lexicommons.com/js/study/session.js?v=98`, `Failed to fetch dynamically imported module: /js/study/session.js`],
    [`key sk-or-v1-0123456789abcdef0123 refused`, `key … refused`],
    [`call 0612345678 at index 42`, `call # at index 42`],
    [`can't find '${"x".repeat(60)}'`, `can't find '…'`],
    [`a ${"long ".repeat(200)}message`, null],
  ];
  for (const [input, want] of cases) {
    const got = cleanMessage(input);
    noSecret(got);
    if (want) assert.equal(got, want);
    else assert.ok(got.length <= ERROR_LIMITS.message && got.endsWith("…"), got);
  }
  for (const junk of [undefined, null, 42, {}, { toString: null }, Symbol("x"), [1, 2]]) assert.equal(typeof cleanMessage(junk), "string");
});

await test("a stack keeps our own frames, in any engine's format, without host, query or anyone else's code", () => {
  const v8 = [
    "TypeError: Cannot read properties of undefined (reading 'x')",
    "    at renderStudy (https://lexicommons.com/js/shell/study.js?v=98:120:15)",
    "    at async Object.open [as go] (https://lexicommons.com/js/shell/main.js?v=98:40:3)",
    "    at chrome-extension://abcdefghijklmnop/content.js:1:2",
    "    at https://lexicommons.com/js/lx/ui.js:9:1",
    "    at async Promise.all (index 0)",
  ].join("\n");
  assert.deepEqual(cleanStack(v8, appOwn), ["renderStudy (/js/shell/study.js:120:15)", "Object.open (/js/shell/main.js:40:3)", "? (/js/lx/ui.js:9:1)"]);
  const safari = ["renderStudy@https://lexicommons.com/js/shell/study.js?v=98:120:15", "@https://lexicommons.com/js/lx/ui.js:9:1", "safari-web-extension://x/y.js:3:4", "global code@https://lexicommons.com/js/shell/main.js:1:1"].join("\n");
  assert.deepEqual(cleanStack(safari, appOwn), ["renderStudy (/js/shell/study.js:120:15)", "? (/js/lx/ui.js:9:1)", "global code (/js/shell/main.js:1:1)"]);
  const firefox = ["renderStudy/<@https://lexicommons.com/js/shell/study.js:120:15", "moz-extension://x/y.js:3:4"].join("\n");
  assert.deepEqual(cleanStack(firefox, appOwn), ["? (/js/shell/study.js:120:15)"]);
  const worker = ["Error: D1_ERROR", "    at Object.fetch (index.js:1234:56)", "    at file:///Users/someone/app/src/app.ts:260:5", "    at x (file:///Users/someone/app/node_modules/hono/dist/hono.js:1:1)"].join("\n");
  assert.deepEqual(cleanStack(worker, workerOwn), ["Object.fetch (index.js:1234:56)", "? (app.ts:260:5)"]);
  const deep = Array.from({ length: 40 }, (_, i) => `    at f${i} (https://lexicommons.com/js/a.js:${i}:1)`).join("\n");
  assert.equal(cleanStack(deep, appOwn).length, ERROR_LIMITS.frames);
  assert.deepEqual(cleanStack(undefined, appOwn), []);
});

await test("a browser is its name, major version and system; a screen is its route names", () => {
  const uas = {
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1": "Safari 26 · iOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36": "Chrome 142 · macOS",
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36": "Chrome 142 · Android",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0": "Edge 142 · Windows",
    "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0": "Firefox 140 · Linux",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1": "Chrome 142 · iOS",
    "": "unknown",
    "curl/8.7.1": "other · other",
  };
  for (const [ua, want] of Object.entries(uas)) assert.equal(coarseBrowser(ua), want);
  assert.equal(cleanPlace("/app/#settings/study/packs"), "/app/#settings/study");
  assert.equal(cleanPlace("/app/#study/session/deck/nl-geheim-123"), "/app/#study/session");
  assert.equal(cleanPlace("/app/#read/book/mijn-boek"), "/app/#read/book");
  assert.equal(cleanPlace("/app/#explore?q=Mijn%20geheim"), "/app/");
  assert.equal(cleanPlace("/app/#know/words/ab12"), "/app/#know/words");
  assert.equal(cleanPlace("/app/?q=private#today"), "?");
  assert.equal(cleanPlace("GET /api/packs/:id"), "GET /api/packs/:id");
  assert.equal(cleanPlace(42), "");
});

await test("a report: what's dropped, and what's kept is clean", () => {
  assert.equal(cleanReport({ message: "Script error.", file: "", line: 0 }), null, "a script from elsewhere");
  assert.equal(cleanReport({ message: "boom", file: "chrome-extension://abc/content.js", line: 3, col: 1 }), null, "an extension's");
  assert.equal(cleanReport({ message: "", stack: "" }), null, "nothing to say");
  assert.equal(cleanReport({ kind: "error", message: "thrown where?", stack: "" }), null, "an error with no frame of ours: someone else's (the CSP allows no inline code)");
  assert.equal(cleanReport({ kind: "rejection", message: "boom", stack: "Error: boom\n    at x (chrome-extension://abc/c.js:1:1)" }), null, "a rejection only in an extension's code");
  assert.deepEqual(cleanReport({ kind: "rejection", message: "quota", stack: "" }), { kind: "rejection", name: "Error", message: "quota", stack: "", place: "", version: "" }, "a promise rejected with a plain value: kept");
  for (const junk of [null, 1, "x", [], { stack: 5, message: { toString: null } }]) assert.doesNotThrow(() => cleanReport(junk));
  const kept = cleanReport({
    kind: "rejection",
    name: "TypeError",
    message: `Unexpected token in "ik woon in Utrecht" from someone@example.com`,
    stack: "TypeError: x\n    at go (https://lexicommons.com/js/shell/main.js?v=98:10:2)\n    at chrome-extension://abc/content.js:1:1",
    place: "/app/#settings/account/Mijn geheim",
    version: "98",
  });
  assert.deepEqual(kept, { kind: "rejection", name: "TypeError", message: `Unexpected token in "…" from [email]`, stack: "go (/js/shell/main.js:10:2)", place: "/app/#settings/account", version: "98" });
  noSecret(JSON.stringify(kept));
  const fromFile = cleanReport({ message: "x is not defined", file: "https://lexicommons.com/js/lx/ui.js?v=98", line: 5, col: 7 });
  assert.equal(fromFile.stack, "? (/js/lx/ui.js:5:7)");
  const odd = cleanReport({ kind: "weird", name: "<script>", message: "m", stack: "    at f (https://h/js/a.js:1:1)", version: "../../x" });
  assert.deepEqual([odd.kind, odd.name, odd.version], ["error", "Error", ""]);
  // The same error at another line or with other numbers is one group; another function is another.
  const a = groupKey({ source: "client", ...cleanReport({ message: "index 3 out of range", stack: "    at f (https://h/js/a.js:10:1)" }) });
  const b = groupKey({ source: "client", ...cleanReport({ message: "index 7 out of range", stack: "    at f (https://h/js/a.js:12:9)" }) });
  const c = groupKey({ source: "client", ...cleanReport({ message: "index 7 out of range", stack: "    at g (https://h/js/a.js:12:9)" }) });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ---------- the store, on the real migrations ----------

const HOUR = 3600_000;
const NOON = Date.UTC(2026, 9, 10, 12);
const rows = async (env, sql = "SELECT * FROM error_groups ORDER BY fingerprint") => (await env.DB.prepare(sql).all()).results;
const report = (over = {}) => JSON.stringify({ kind: "error", name: "TypeError", message: "x is undefined", stack: "    at f (https://lexicommons.com/js/a.js:1:1)", place: "/app/#today", version: "98", ...over });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

await test("the app started again by itself: only a reload of the Home Screen app on a touch screen, not its own, not after being hidden", () => {
  const phone = { type: "reload", installed: true, touch: true, own: false, lastSeen: "visible" };
  assert.equal(startedAgainByItself(phone), true);
  assert.equal(startedAgainByItself({ ...phone, lastSeen: null }), true, "last seen not known: told");
  // Each one thing different is no report: the control above passes, so each of these can only fail on its own rule.
  for (const [what, over] of [
    ["a first open", { type: "navigate" }],
    ["back or forward", { type: "back_forward" }],
    ["no navigation entry", { type: "" }],
    ["a browser tab (its reload is the person's)", { installed: false }],
    ["a computer's installed app (it has a reload key)", { touch: false }],
    ["the app's own Reload", { own: true }],
    ["ended while hidden (a phone freeing memory)", { lastSeen: "hidden" }],
  ]) {
    assert.equal(startedAgainByItself({ ...phone, ...over }), false, what);
  }
  assert.equal(startedAgainByItself({ ...phone, installed: "yes" }), false, "only a true installed counts");
});

await test("a reload report keeps its screen and the app's version, nothing else, whatever it's sent with", () => {
  const sent = cleanReport({
    kind: "reload",
    name: "TypeError",
    message: 'Mijn geheim "ik woon in Utrecht" someone@example.com',
    stack: "    at f (https://lexicommons.com/js/a.js:1:1)",
    file: "https://evil.example/x.js",
    line: 3,
    place: "/app/#explore/yours/Mijn-geheim-0612345678?q=private",
    version: "120",
    extra: "token=abc",
  });
  assert.deepEqual(sent, { kind: "reload", name: RELOAD.name, message: RELOAD.message, stack: "", place: "/app/#explore/yours", version: "120" });
  noSecret(JSON.stringify(sent));
  assert.deepEqual(cleanReport({ kind: "reload" }), { kind: "reload", name: RELOAD.name, message: RELOAD.message, stack: "", place: "", version: "" });
  assert.equal(cleanReport({ kind: "reload", version: "v 1; drop" }).version, "", "a version is a version or nothing");
  // A screen is its own kind of reload: the same screen twice is one group, another screen another.
  const key = (place) => groupKey({ source: "client", ...cleanReport({ kind: "reload", place }) });
  assert.equal(key("/app/#explore/yours"), key("/app/#explore/yours/other-pack"));
  assert.notEqual(key("/app/#explore/yours"), key("/app/#today"));
  // The control: an error still keeps its own words and frames (so the reload rule above is the reload's alone).
  const error = cleanReport({ kind: "error", name: "TypeError", message: "x is undefined", stack: "    at f (https://lexicommons.com/js/a.js:1:1)", place: "/app/#today", version: "120" });
  assert.equal(error.message, "x is undefined");
  assert.equal(error.stack, "f (/js/a.js:1:1)");
});

await test("a reload report is kept as one group per screen, counted", async () => {
  const { env } = await workerEnv();
  errors.resetWindow();
  const reload = (place) => JSON.stringify({ kind: "reload", place, version: "120", message: "anything at all", stack: "at f (https://lexicommons.com/js/a.js:1:1)" });
  assert.equal(await errors.recordClientReport(env, reload("/app/#explore/yours"), UA, NOON), true);
  assert.equal(await errors.recordClientReport(env, reload("/app/#explore/yours"), UA, NOON + 1000), true);
  assert.equal(await errors.recordClientReport(env, reload("/app/#today"), UA, NOON + 2000), true);
  const groups = await rows(env, "SELECT kind, name, message, stack, place, version, count FROM error_groups ORDER BY place");
  assert.deepEqual(groups, [
    { kind: "reload", name: "Reload", message: RELOAD.message, stack: "", place: "/app/#explore/yours", version: "120", count: 2 },
    { kind: "reload", name: "Reload", message: RELOAD.message, stack: "", place: "/app/#today", version: "120", count: 1 },
  ]);
});

await test("the same error is one group, counted, and the hour counts it; a junk report keeps nothing", async () => {
  const { env } = await workerEnv();
  errors.resetWindow();
  assert.equal(await errors.recordClientReport(env, report(), UA, NOON), true);
  assert.equal(await errors.recordClientReport(env, report({ message: "x is undefined" }), UA, NOON + 1000), true);
  assert.equal(await errors.recordClientReport(env, report({ message: "y is undefined", stack: "    at g (https://lexicommons.com/js/b.js:1:1)" }), UA, NOON + 2000), true);
  assert.equal(await errors.recordClientReport(env, "not json", UA, NOON), false);
  assert.equal(await errors.recordClientReport(env, JSON.stringify({ message: "Script error." }), UA, NOON), false);
  const groups = await rows(env);
  assert.equal(groups.length, 2);
  const x = groups.find((g) => g.message === "x is undefined");
  assert.equal(x.count, 2);
  assert.equal(x.browser, "Chrome 142 · macOS");
  assert.equal(x.first_seen, NOON);
  assert.equal(x.last_seen, NOON + 1000);
  assert.match(x.fingerprint, /^[0-9a-f]{16}$/);
  assert.deepEqual(await rows(env, "SELECT hour, source, count FROM error_hours"), [{ hour: NOON, source: "client", count: 3 }]);
});

await test("a report cleaned on the device, then again on the server, comes out the same: function names kept, one group, two functions two", async () => {
  // The device sends cleaned frames, "fn (path:line:col)", and the server cleans them again (errors.ts recordClientReport). Before 7 Nov
  // 2026 the second reading lost every name ("? (…)"), so two errors in one file with one message were one group.
  const stacks = {
    v8: "Error: x\n    at renderStudy (https://lexicommons.com/js/shell/study.js?v=98:120:15)\n    at async Object.open [as go] (https://lexicommons.com/js/shell/main.js:40:3)\n    at https://lexicommons.com/js/lx/ui.js:9:1",
    safari: "renderStudy@https://lexicommons.com/js/shell/study.js?v=98:120:15\nglobal code@https://lexicommons.com/js/shell/main.js:1:1",
    firefox: "renderStudy/<@https://lexicommons.com/js/shell/study.js:120:15",
  };
  for (const [engine, stack] of Object.entries(stacks)) {
    const device = cleanReport({ kind: "error", name: "TypeError", message: "x is undefined", stack, place: "/app/#today", version: "98" });
    const server = cleanReport(device);
    assert.deepEqual(server, device, `${engine}: cleaned twice differs from once`);
    assert.equal(groupKey({ source: "client", ...server }), groupKey({ source: "client", ...device }), `${engine}: another group`);
  }
  assert.match(cleanReport(cleanReport({ kind: "error", name: "Error", message: "m", stack: stacks.v8 })).stack, /^renderStudy \(\/js\/shell\/study\.js:120:15\)\nObject\.open /);
  // Through the server: two errors in one file with one message, thrown in two functions, sent as the device sends them, are two groups,
  // each keeping its function's name.
  const { env } = await workerEnv();
  errors.resetWindow();
  for (const fn of ["drawCard", "drawPath"]) {
    const sent = cleanReport({ kind: "error", name: "TypeError", message: "x is undefined", stack: `TypeError: x is undefined\n    at ${fn} (https://lexicommons.com/js/know/today.js:10:5)`, place: "/app/#today", version: "98" });
    assert.equal(await errors.recordClientReport(env, JSON.stringify(sent), UA, NOON), true);
  }
  const kept = (await rows(env)).map((g) => g.stack).sort();
  assert.deepEqual(kept, ["drawCard (/js/know/today.js:10:5)", "drawPath (/js/know/today.js:10:5)"], `kept: ${JSON.stringify(kept)}`);
});

await test("past the per-isolate limit, writes wait, and what waited is counted into the hour by the next write", async () => {
  const { env } = await workerEnv();
  errors.resetWindow();
  for (let i = 0; i < errors.ERRORS.perMinute + 5; i++) await errors.recordClientReport(env, report(), UA, NOON + i);
  assert.equal((await rows(env))[0].count, errors.ERRORS.perMinute);
  assert.equal((await rows(env, "SELECT count FROM error_hours"))[0].count, errors.ERRORS.perMinute);
  await errors.recordClientReport(env, report(), UA, NOON + 61_000);
  assert.equal((await rows(env, "SELECT count FROM error_hours"))[0].count, errors.ERRORS.perMinute + 6, "the 5 held, plus this one");
});

await test("past the cap, a new kind is counted in its source's overflow row; a known one still counts", async () => {
  const { env } = await workerEnv();
  const insert = env.DB.prepare("INSERT INTO error_groups (fingerprint, source, kind, name, message, stack, place, version, browser, first_seen, last_seen, count) VALUES (?, 'client', 'error', 'Error', ?, '', '', '', '', ?, ?, 1)");
  await env.DB.batch(Array.from({ length: errors.ERRORS.groupCap }, (_, i) => insert.bind(i.toString(16).padStart(16, "0"), `m${i}`, NOON, NOON)));
  errors.resetWindow();
  await errors.recordClientReport(env, report({ message: "new one" }), UA, NOON + 1);
  await errors.recordClientReport(env, report({ message: "another new one" }), UA, NOON + 2);
  const overflow = await rows(env, "SELECT * FROM error_groups WHERE fingerprint = 'overflow:client'");
  assert.equal(overflow.length, 1);
  assert.equal(overflow[0].count, 2);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM error_groups"))[0].n, errors.ERRORS.groupCap + 1);
  // A server error past the cap goes to its own overflow row.
  await errors.recordServerError(env, "server", new Error("db down"), "GET /api/me", NOON + 3);
  assert.equal((await rows(env, "SELECT count FROM error_groups WHERE fingerprint = 'overflow:server'"))[0].count, 1);
});

await test("a server error: the route's pattern, the Worker's frames, the message cleaned", async () => {
  const { env } = await workerEnv();
  errors.resetWindow();
  const error = new TypeError(`no such row "Mijn geheim" for someone@example.com`);
  await errors.recordServerError(env, "server", error, "GET /api/packs/:id", NOON);
  await errors.recordServerError(env, "server", new Error("x"), "GET /api/packs/Mijn geheim?q=private", NOON);
  await errors.recordServerError(env, "cron", "a string thrown", "cron reminders", NOON);
  const groups = await rows(env, "SELECT * FROM error_groups ORDER BY source, place");
  noSecret(JSON.stringify(groups));
  const packs = groups.find((g) => g.place === "GET /api/packs/:id");
  assert.equal(packs.name, "TypeError");
  assert.equal(packs.kind, "exception");
  assert.equal(packs.message, `no such row "…" for [email]`);
  assert.match(packs.stack, /test-errors\.mjs:\d+:\d+/, "this file's frame, by its name only");
  assert.doesNotMatch(packs.stack, /\/Users\//);
  assert.ok(groups.some((g) => g.place === "?"), "a place that isn't a pattern is kept as ?");
  assert.ok(groups.some((g) => g.source === "cron" && g.message === "a string thrown" && g.place === "cron reminders"));
});

await test("the sweep, error_reports' view, and clearing", async () => {
  const { env } = await workerEnv();
  errors.resetWindow();
  const old = NOON - 31 * 24 * HOUR;
  await errors.recordClientReport(env, report({ message: "old one" }), UA, old);
  await errors.recordClientReport(env, report({ message: "recent one" }), UA, NOON - 2 * HOUR);
  await errors.recordServerError(env, "server", new Error("now"), "POST /api/x", NOON);
  const swept = await errors.sweepErrors(env, NOON);
  assert.deepEqual(swept, { groups: 1, hours: 1 });
  const view = await errors.errorReports(env, {}, NOON);
  assert.equal(view.kinds, 2);
  assert.deepEqual(view.groups.map((g) => g.message), ["now", "recent one"]);
  assert.equal(view.groups[0].last_seen, new Date(NOON).toISOString());
  assert.deepEqual(view.last_48_hours, [{ hour: new Date(NOON - 2 * HOUR).toISOString(), client: 1 }, { hour: new Date(NOON).toISOString(), server: 1 }]);
  assert.deepEqual((await errors.errorReports(env, { source: "server" }, NOON)).groups.map((g) => g.message), ["now"]);
  const fp = view.groups[0].fingerprint;
  assert.equal(await errors.clearErrors(env, { fingerprints: [fp] }), 1);
  assert.equal(await errors.clearErrors(env, { all: true }), 1);
  assert.equal(await errors.clearErrors(env, {}), 0);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM error_hours"))[0].n, 2, "the hours stay");
});

await test("a failing database drops the report and never throws", async () => {
  const { env, faults } = await workerEnv();
  errors.resetWindow();
  faults.failing = /error_groups/;
  assert.equal(await errors.recordClientReport(env, report(), UA, NOON), false);
});

// An error as the D1 binding throws one (workerd's d1-api): "D1_ERROR: <message>", the service's error its cause.
const d1Error = (message) => new Error(`D1_ERROR: ${message}`, { cause: new Error(message) });

await test("D1's overloaded is the D1 binding's own error, never words alone: an error that only says so (planted) isn't one", async () => {
  for (const message of ["D1 DB is overloaded. Too many requests queued.", "D1 DB is overloaded. Requests queued for too long.", "D1 DB is overloaded. Too many resources consumed within a 10 second window"]) {
    assert.equal(errors.isD1Overloaded(d1Error(message)), true, message);
  }
  assert.equal(errors.isD1Overloaded(new Error("D1_EXEC_ERROR: D1 DB is overloaded. Too many requests queued.", { cause: new Error("D1 DB is overloaded. Too many requests queued.") })), true, "exec's");
  const planted = [
    new Error("D1_ERROR: D1 DB is overloaded. Too many requests queued."), // the binding's words, with no cause
    new Error("Invalid URL: D1 DB is overloaded. Too many requests queued."), // someone's words quoted in an exception
    new Error("D1 DB is overloaded. Too many requests queued.", { cause: new Error("D1 DB is overloaded. Too many requests queued.") }), // no D1_ERROR
    new Error("D1_ERROR: no such table: x", { cause: new Error("no such table: x") }), // D1's, but not an overload
    new Error("D1_ERROR: D1 DB is overloaded.", { cause: "D1 DB is overloaded." }), // a cause that isn't an error
    "D1_ERROR: D1 DB is overloaded. Too many requests queued.", // a string thrown
  ];
  for (const error of planted) assert.equal(errors.isD1Overloaded(error), false, String(error?.message ?? error));
});

await test("D1's overloaded: never written while it lasts; once D1 answers again, one group counts them all, and the hour too", async () => {
  const { env } = await workerEnv();
  errors.resetWindow();
  const messages = ["D1 DB is overloaded. Too many requests queued.", "D1 DB is overloaded. Requests queued for too long.", "D1 DB is overloaded. Too many resources consumed within a 10 second window"];
  for (const other of ["db down", "Network connection lost.", "overloaded"]) assert.equal(errors.isD1Overloaded(d1Error(other)), false, other);
  for (let i = 0; i < 6; i++) assert.equal(await errors.recordServerError(env, "server", d1Error(messages[i % 3]), "GET /api/me", NOON + i), false);
  assert.equal((await rows(env)).length, 0, "nothing written while it lasts");
  assert.equal(errors.overloadsHeld(), 6);
  assert.equal(await errors.flushOverloads(env, NOON + 5 + errors.OVERLOAD.quiet - 1), false, "too soon after the last");
  assert.equal((await rows(env)).length, 0);
  assert.equal(await errors.flushOverloads(env, NOON + 5 + errors.OVERLOAD.quiet), true);
  const [group] = await rows(env);
  assert.deepEqual([group.source, group.kind, group.place, group.count], ["server", "overloaded", "D1", 6]);
  assert.deepEqual(await rows(env, "SELECT hour, source, count FROM error_hours"), [{ hour: NOON, source: "server", count: 6 }]);
  assert.equal(await errors.flushOverloads(env, NOON + 60_000), false, "nothing left to write");
  // A second overload later adds to the same group.
  await errors.recordServerError(env, "mcp", d1Error(messages[0]), "mcp tool", NOON + 70_000);
  assert.equal(await errors.flushOverloads(env, NOON + 70_000 + errors.OVERLOAD.quiet), true);
  assert.equal((await rows(env))[0].count, 7);
  // Any other error is written at once, as before (the control), and so is one that only says "overloaded" in its words.
  assert.equal(await errors.recordServerError(env, "server", new Error("db down"), "GET /api/me", NOON + 90_000), true);
  assert.equal(await errors.recordServerError(env, "server", new Error("Invalid URL: D1 DB is overloaded. Too many requests queued."), "GET /api/me", NOON + 91_000), true);
  assert.equal((await rows(env)).length, 3);
});

await test("D1's overloaded: a summary D1 still refuses keeps its count for the next time", async () => {
  const { env, faults } = await workerEnv();
  errors.resetWindow();
  for (let i = 0; i < 3; i++) await errors.recordServerError(env, "server", d1Error("D1 DB is overloaded. Too many requests queued."), "GET /api/look", NOON + i);
  faults.failing = /error_groups/;
  assert.equal(await errors.flushOverloads(env, NOON + errors.OVERLOAD.quiet + 10), false);
  assert.equal(errors.overloadsHeld(), 3, "kept");
  faults.failing = null;
  assert.equal(await errors.flushOverloads(env, NOON + errors.OVERLOAD.quiet + 20), true);
  assert.equal((await rows(env))[0].count, 3);
});

// ---------- the spike alert ----------

const facts = (over) => ({ severe: 0, severeNewest: 0, admin: 0, adminNewest: 0, adminOldest: null, open: 0, openOldest: null, errorsNow: 0, errorsLastHour: 0, errorsDayBefore: 0, errorKinds: 0, ...over });
const never = { severe: 0, admin: 0, stuck: 0, errors: 0 };

await test("a spike: at least the floor and 4× the usual, this hour or the last, outside quiet hours, at most every 6 hours, counts only", () => {
  assert.deepEqual(alertsDue(facts({ errorsNow: ERROR_SPIKE.floor - 1 }), never, false, NOON), [], "under the floor");
  const due = alertsDue(facts({ errorsNow: 30, errorKinds: 3 }), never, false, NOON);
  assert.deepEqual(due.map((d) => d.kind), ["errors"]);
  assert.equal(due[0].body, "30 errors in an hour, against about 0 an hour the day before, in 3 kinds: error_reports.");
  assert.deepEqual(alertsDue(facts({ errorsLastHour: 30, errorKinds: 1 }), never, false, NOON).map((d) => d.kind), ["errors"], "the last whole hour");
  assert.deepEqual(alertsDue(facts({ errorsNow: 100, errorsDayBefore: 24 * 30 }), never, false, NOON), [], "100 against 30 an hour: under 4×");
  assert.deepEqual(alertsDue(facts({ errorsNow: 120, errorsDayBefore: 24 * 30 }), never, false, NOON).map((d) => d.kind), ["errors"], "4× the usual");
  assert.deepEqual(alertsDue(facts({ errorsNow: 30 }), never, true, NOON), [], "quiet hours");
  assert.deepEqual(alertsDue(facts({ errorsNow: 30 }), { ...never, errors: NOON - ERROR_SPIKE.every + 1000 }, false, NOON), [], "told within 6 hours");
  assert.deepEqual(alertsDue(facts({ errorsNow: 30 }), { ...never, errors: NOON - ERROR_SPIKE.every }, false, NOON).map((d) => d.kind), ["errors"]);
});

await test("the cron: a spike reaches an admin's device, once, and the push says counts only", async () => {
  const { env } = await workerEnv();
  const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  env.VAPID_PUBLIC_KEY = Buffer.from(await webcrypto.subtle.exportKey("raw", keys.publicKey)).toString("base64url");
  env.VAPID_PRIVATE_JWK = JSON.stringify(await webcrypto.subtle.exportKey("jwk", keys.privateKey));
  const pair = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const p256dh = Buffer.from(await webcrypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
  const auth = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const run = (q, ...b) => env.DB.prepare(q).bind(...b).run();
  await run("INSERT INTO users (id, name, created_at) VALUES ('adm', 'Admin', 0)");
  await run("INSERT INTO user_roles (user_id, role, granted_at, granted_by) VALUES ('adm', 'admin', 0, 'd1')");
  await run("INSERT INTO push_subscriptions (endpoint, user_id, device, p256dh, auth, created_at, used_at) VALUES ('https://fcm.googleapis.com/fcm/send/phone', 'adm', 'phone', ?, ?, 0, 0)", p256dh, auth);
  const pushed = [];
  const service = async (url, init) => (pushed.push({ topic: new Headers(init.headers).get("Topic") }), new Response(null, { status: 201 }));
  // A quiet day, then a burst this hour with planted words in it.
  errors.resetWindow();
  for (let i = 0; i < 24; i++) await errors.recordServerError(env, "server", new Error("usual"), "GET /api/me", NOON - (i + 2) * HOUR);
  assert.deepEqual(await runAdminAlerts(env, NOON, service), { due: 0, sent: 0 }, "nothing spiking");
  for (let i = 0; i < 30; i++) {
    errors.resetWindow();
    await errors.recordClientReport(env, report({ message: `Mijn geheim ${i}` }), UA, NOON + i);
  }
  const told = await runAdminAlerts(env, NOON + 60_000, service);
  assert.equal(told.sent, 1);
  assert.deepEqual(pushed.map((p) => p.topic), ["admin-errors"]);
  const logged = (await rows(env, "SELECT action, note FROM admin_log WHERE action LIKE 'alert.%'"));
  assert.equal(logged.length, 1);
  assert.equal(logged[0].action, "alert.errors");
  assert.match(logged[0].note, /^30 errors in an hour, against about 1 an hour the day before, in 1 kind: error_reports\./);
  noSecret(logged[0].note);
  pushed.length = 0;
  await runAdminAlerts(env, Date.now() + 1000, service);
  assert.deepEqual(pushed, [], "not again within 6 hours (the log's clock is the real one)");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
