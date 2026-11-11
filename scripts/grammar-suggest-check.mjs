#!/usr/bin/env node
// Suggestions to a language's shared grammar, end to end on a LOCAL server and its own state (src/grammar-suggestions.ts,
// public/js/explore/grammar.js): Explore's way in and the grammar's page; Knowledge's way in (an idea's sheet's Suggest a better
// explanation, explore/suggest-way.js, none with sharing closed); a learner suggesting a new pattern in the app
// (refused in words first, then sent); another person's AI suggesting a fix over MCP (refused, then sent) and the
// learner liking and reporting it on the pattern's page; the moderators' queue holding the report; an admin's review
// over MCP accepting both into the grammar's next revision (published, every source saying how its suggester knows the
// language and never who) and declining another, saying why; the learner's device taking the revision, Explore and
// Yours saying what happened; withdrawing; and the tools each connection sees.
//
//   node scripts/grammar-suggest-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// The server: as grammar-check.mjs's, with --var COMMUNITY_SHARING:everyone. It writes its accounts straight into the
// state's D1 (and their accepted sharing terms), so only a local server; a fresh state. Headless Chrome through the
// channel's parallel lane. Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
const PERSIST = opt("persist-to");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: grammar-suggest-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>\n(it writes test accounts into that state, so only a local server)");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const results = [];
const problems = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// ---------- accounts written straight into the local D1 ----------

const wrangler = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sql = (command) => {
  const out = wrangler(["d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
function account(name, { admin = false } = {}) {
  const id = `gsg${run}${randomBytes(5).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  // Established (a week old), with the sharing terms accepted (only the app accepts them, never a tool).
  const since = now - 8 * 86_400_000;
  const statements = [
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${since})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'grammar-suggest-check')`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'grammar suggest check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${admin ? 1 : 0})`,
    `INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(id)}, 1, ${now})`,
  ];
  if (admin) statements.push(`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'grammar-suggest-check')`);
  sql(statements.join("; "));
  return { id, name, cookie, token };
}

// ---------- MCP ----------

async function rpc(token, method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
const toolNames = async (token) => (await rpc(token, "tools/list", {})).result.tools.map((t) => t.name);
async function tool(token, name, args = {}) {
  const { result, error } = await rpc(token, "tools/call", { name, arguments: args });
  if (error) return { error: error.message };
  const text = result.content[0].text;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return result.isError ? { error: typeof value === "string" ? value : JSON.stringify(value), value } : value;
}
async function must(token, name, args) {
  const value = await tool(token, name, args);
  if (value?.error) throw new Error(`${name}: ${value.error.slice(0, 600)}`);
  return value;
}

// ---------- the run ----------

const ZELF = { name: "zelf: -self, for emphasis", about: "Put zelf after a word to stress it: ik doe het zelf (I do it self), zij zelf (she self)." };
const V2_FIX = "In a main clause the verb comes second, even after a time word: morgen ga ik (tomorrow go I).";
const learner = account("Grammar learner");
const other = account("Other learner");
const admin = account("Grammar admin", { admin: true });
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE }]);
const page = await context.newPage();
// The refused suggestion's 422 (the app's answer to a contribution that doesn't pass, as corrections' is): expected
// once, while that stage sends it; any other console error is a problem.
let refusalsExpected = 0;
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (refusalsExpected > 0 && /status of 422/.test(m.text()) && (m.location()?.url ?? "").endsWith("/api/community/grammar/nl/suggestions")) return void refusalsExpected--;
  problems.push(`console: ${m.text()} (${m.location()?.url ?? ""})`);
});
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
// A picture once the page has settled: no slide between pages (or anything else) still moving.
const shot = async (name) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
async function until(fn, arg, timeout = 15_000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 160)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
const rowTitles = () => page.evaluate(() => [...document.querySelectorAll('[data-part="page"] [data-part="list-row"] .lx-row-title')].map((n) => n.textContent));
const sheet = () => page.locator(".lx-sheet-layer:not([hidden])").last();
const ids = {};

await stage("the language's grammar page (by its address: Explore's home no longer has its row), its patterns in the order to learn them, and nothing suggested yet", async () => {
  await page.goto(`${BASE}/app/#explore/grammar?lang=nl`);
  await page.getByText("Revision 1: 29 patterns.").waitFor();
  const titles = await rowTitles();
  // Nothing suggested yet: no suggestions above the patterns at all (they show only when some are waiting).
  const heads = () => page.evaluate(() => [...document.querySelectorAll('[data-part="page"] [data-part="section-title"], [data-part="page"] [data-part="group-label"]')].map((n) => n.textContent.trim()));
  assert(titles.includes("Verb second") && titles.indexOf("Verb second") < titles.indexOf("Perfect tense: verb last"), titles.join(" | "));
  assert(!(await heads()).includes("New patterns suggested") && !titles.some((t) => /^A new pattern|^A fix|^Retire it/.test(t)), `suggestions with none made: ${(await heads()).join(" | ")}`);
  await shot("01-grammar");
  return `${titles.length} rows`;
});

await stage("Knowledge's way in: an idea's sheet ends with Suggest a better explanation, which opens Explore's fix sheet in its place with the idea's own words; with sharing closed to this person, no such row", async () => {
  await page.goto(`${BASE}/app/#know/ideas`);
  const firstIdea = page.locator('[data-part="page"] [data-part="list-row"][aria-haspopup]').first();
  await firstIdea.waitFor();
  const named = (await firstIdea.locator(".lx-row-title").textContent()).trim();
  await firstIdea.click();
  const way = sheet().locator('[data-part="list-row"]', { hasText: "Suggest a better explanation" });
  await way.waitFor();
  assert(/For everyone learning Dutch/.test(await way.innerText()), `the row: ${await way.innerText()}`);
  await shot("01b-idea-sheet");
  await way.click();
  await sheet().getByText("Suggest a fix", { exact: true }).waitFor();
  await page.waitForTimeout(600);
  const shown = await page.locator(".lx-sheet-layer:not([hidden])").count();
  const name = await sheet().getByLabel("Its name").inputValue();
  assert(shown === 1, `${shown} sheets up`);
  assert(name === named, `the fix sheet's name: "${name}" (the idea: "${named}")`);
  await shot("01c-fix-from-knowledge");
  await page.keyboard.press("Escape");
  // Sharing closed to this person (/api/me as COMMUNITY_SHARING "admins" answers a learner): the same sheet, no way to suggest.
  const closed = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await closed.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE }]);
  await closed.route("**/api/me", async (route) => {
    const r = await route.fetch();
    const me = await r.json();
    await route.fulfill({ response: r, json: { ...me, mayShare: false, features: { ...(me.features ?? {}), sharing: "admins" } } });
  });
  const other = await closed.newPage();
  await other.goto(`${BASE}/app/#know/ideas`);
  const idea = other.locator('[data-part="page"] [data-part="list-row"][aria-haspopup]').first();
  await idea.waitFor();
  await idea.click();
  await other.locator(".lx-sheet-layer:not([hidden])").last().getByText("Practice this").waitFor();
  const rows = await other.locator(".lx-sheet-layer:not([hidden])").last().locator('[data-part="list-row"]', { hasText: "Suggest a better explanation" }).count();
  await closed.close();
  assert(rows === 0, "a way to suggest with sharing closed");
  await page.goto(`${BASE}/app/#explore/grammar?lang=nl`);
  await page.getByText("Revision 1: 29 patterns.").waitFor();
  return `"${named}": its sheet's row opens the fix sheet with its name`;
});

await stage("a learner suggests a new pattern in the app: refused in words (no example with its gloss), then sent, and listed", async () => {
  await page.getByRole("button", { name: "Suggest a new pattern" }).click();
  const s = sheet();
  await s.getByLabel("Its name").fill(ZELF.name);
  await s.getByLabel("Its explanation").fill("Put zelf after a word to stress it.");
  await s.getByText("I'm a native speaker").click();
  refusalsExpected = 1;
  await s.getByRole("button", { name: "Send the suggestion" }).click();
  await s.getByText("literal gloss in brackets").waitFor();
  assert(refusalsExpected === 0, "the refusal wasn't a 422 from the server");
  await shot("02-refused");
  await s.getByLabel("Its explanation").fill(ZELF.about);
  await s.getByRole("button", { name: "Send the suggestion" }).click();
  await page.getByText("Sent: it waits for an admin.").waitFor();
  // The page draws itself again from the server just after it says so.
  await until((title) => [...document.querySelectorAll('[data-part="list-row"] .lx-row-title')].some((n) => n.textContent === title), `A new pattern: ${ZELF.name}`);
  const titles = await rowTitles();
  const sections = await page.evaluate(() => [...document.querySelectorAll('[data-part="page"] [data-part="section-title"], [data-part="page"] [data-part="group-label"]')].map((n) => n.textContent.trim()));
  assert(titles.includes(`A new pattern: ${ZELF.name}`) && sections.includes("New patterns suggested"), `${titles.join(" | ")} / ${sections.join(" | ")}`);
  await shot("03-sent");
  const [mine] = await must(learner.token, "grammar_suggestions", { mine: true });
  assert(mine.kind === "new" && mine.via === "app" && mine.knows === "native" && mine.change.about === ZELF.about, JSON.stringify(mine));
  ids.zelf = mine.id;
});

await stage("another person's AI suggests a fix over MCP: refused at once with every problem, then sent, marked as made with their AI", async () => {
  const refused = await tool(other.token, "suggest_pattern", { language: "nl", kind: "fix", pattern: "v2", about: "The verb comes second.", knows: "fluent" });
  assert(refused.error && refused.value?.problems?.some((p) => p.includes("literal gloss")), JSON.stringify(refused));
  const sent = await must(other.token, "suggest_pattern", { language: "nl", kind: "fix", pattern: "v2", about: V2_FIX, knows: "fluent", note: "Learners miss the inversion after a time word." });
  assert(sent.suggested && sent.suggestion.via === "ai", JSON.stringify(sent));
  ids.fix = sent.suggestion.id;
  const retire = await must(other.token, "suggest_pattern", { language: "nl", kind: "retire", pattern: "omte", knows: "fluent" });
  ids.retire = retire.suggestion.id;
  const tools = await toolNames(other.token);
  assert(tools.includes("suggest_pattern") && tools.includes("grammar_suggestions") && !tools.includes("review_grammar_suggestions"), tools.join(", "));
});

await stage("the pattern's page: its explanation, where it's from, the fix waiting; the learner likes it and reports the retirement", async () => {
  await page.goto(`${BASE}/app/#explore/pattern/nl/v2`);
  await page.getByText("Where it's from: First drafted by Lexicommons, open to correction.").waitFor();
  await page.getByText(/A fix: its explanation/).click();
  await sheet().getByText(V2_FIX).waitFor();
  assert(!(await sheet().getByText("with their AI").count()), "a suggestion names no one's AI");
  await sheet().getByText("Like it", { exact: true }).click();
  await page.getByText("Liked.").waitFor();
  const [fix] = await must(learner.token, "grammar_suggestions", { language: "nl", pattern: "v2" });
  assert(fix.likes === 1 && fix.liked, JSON.stringify(fix));
  await shot("04-pattern");
  await page.goto(`${BASE}/app/#explore/pattern/nl/omte`);
  await page.getByText("Retire it").first().click();
  await sheet().getByText("Report it", { exact: true }).click();
  await sheet().getByText("Spam, or not a real suggestion").click();
  await sheet().getByRole("button", { name: "Send report" }).click();
  await page.getByText("Thanks. It's with the moderators.").waitFor();
});

await stage("the moderators' queue holds the report as a grammar case, read in full, and dismissed", async () => {
  const queue = await must(admin.token, "mod_queue", {});
  const found = queue.cases.find((c) => c.grammar === ids.retire);
  assert(found && found.kind === "grammar", JSON.stringify(queue.cases));
  const kase = await must(admin.token, "mod_get", { grammar: ids.retire });
  assert(kase.grammar.pattern === "omte" && kase.reports.length === 1, JSON.stringify(kase).slice(0, 300));
  const done = await must(admin.token, "mod_resolve", { report: kase.reports[0].id, decision: "dismiss", why: "A real suggestion; not spam." });
  assert(done.shown === "visible", JSON.stringify(done));
});

let published = null;
await stage("an admin accepts the new pattern and the fix into revision 2 over MCP, and declines the retirement saying why", async () => {
  const waiting = await must(admin.token, "grammar_suggestions", { language: "nl" });
  assert(waiting.length === 3, JSON.stringify(waiting.map((s) => s.id)));
  const refused = await tool(learner.token, "review_grammar_suggestions", { language: "nl", accept: [ids.zelf] });
  assert(refused.error, "a learner reviewed");
  published = await must(admin.token, "review_grammar_suggestions", { language: "nl", accept: [ids.zelf, ids.fix], decline: [{ id: ids.retire, why: "om … te is still taught: keep it." }] });
  assert(published.revision === 2 && published.accepted.length === 2 && published.declined[0] === ids.retire, JSON.stringify(published));
  const view = await must(admin.token, "library_get", {});
  assert(view.grammar.nl.revision === 2, JSON.stringify(view.grammar));
  const file = await (await fetch(`${BASE}${view.grammar.nl.url}`)).json();
  const zelfId = file.patterns["zelf-self-for-emphasis"];
  assert(zelfId?.source?.by === "A native speaker, in Explore" && !JSON.stringify(file).includes(learner.name) && !JSON.stringify(file).includes(other.name), JSON.stringify(zelfId));
  assert(file.patterns.v2.about === V2_FIX && file.patterns.v2.source.drafted === "with their AI" && file.patterns.v2.source.by === "A fluent speaker, in Explore", JSON.stringify(file.patterns.v2));
  return `revision 2 at ${view.grammar.nl.version}`;
});

await stage("the learner's device takes revision 2; Explore shows the new pattern with where it's from; Yours says what happened", async () => {
  await page.goto(`${BASE}/app/#explore`);
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  const here = await page.evaluate(async () => (await import("/js/lang/grammar.js")).grammarNow("nl"));
  assert(here.revision === 2 && here.patterns.v2.about === "In a main clause the verb comes second, even after a time word: morgen ga ik (tomorrow go I).", JSON.stringify(here.patterns.v2));
  await page.goto(`${BASE}/app/#explore/pattern/nl/zelf-self-for-emphasis`);
  await page.getByText("Where it's from: A native speaker, in Explore").waitFor();
  await page.getByRole("heading", { name: ZELF.name }).waitFor();
  await shot("05-accepted");
  await page.goto(`${BASE}/app/#explore/yours`);
  await page.getByText("Accepted, in revision 2").waitFor();
  const other$ = await must(other.token, "grammar_suggestions", { mine: true });
  const declined = other$.find((s) => s.id === ids.retire);
  assert(declined.state === "declined" && declined.why === "om … te is still taught: keep it.", JSON.stringify(declined));
  await shot("06-yours");
});

await stage("withdrawing: a suggestion of yours that waits, from its sheet", async () => {
  const sent = await must(learner.token, "suggest_pattern", { language: "nl", kind: "retire", pattern: "niet", knows: "native" });
  await page.goto(`${BASE}/app/#explore/pattern/nl/niet`);
  await page.getByText("Retire it").first().click();
  await sheet().getByText("Take it back", { exact: true }).click();
  await page.getByText("Taken back.").waitFor();
  const [mine] = (await must(learner.token, "grammar_suggestions", { mine: true })).filter((s) => s.id === sent.suggestion.id);
  assert(mine.state === "withdrawn", JSON.stringify(mine));
});

await stage("crafted bodies on every grammar route: refused in words (400, or 422 with the problems), never a 500", async () => {
  const send = async (method, path, body) => {
    const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${learner.cookie}`, "Content-Type": "application/json" }, body });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const [someone] = await must(learner.token, "grammar_suggestions", { language: "nl", decided: true });
  const suggest = "/api/community/grammar/nl/suggestions";
  const crafted = [
    ["POST", suggest, '{"kind":{"toString":null},"knows":"native"}'],
    ["POST", suggest, '{"kind":"new","name":{"toString":null},"about":"x","knows":"native"}'],
    ["POST", suggest, '{"kind":"new","name":"x","about":{"toString":null},"knows":"native"}'],
    ["POST", suggest, '{"kind":"new","name":"x","about":"Put it: ik werk (I work).","after":[{"toString":null}],"knows":"native"}'],
    ["POST", suggest, '{"kind":"fix","pattern":{"toString":null},"about":"Put it: ik werk (I work).","knows":"native"}'],
    ["POST", suggest, '{"kind":"retire","pattern":"__proto__","knows":"native"}'],
    ["POST", suggest, '{"kind":"retire","pattern":"niet","knows":{"toString":null}}'],
    ["POST", suggest, '{"kind":"retire","pattern":"niet","knows":"native","note":["x"]}'],
    ["POST", suggest, "not json"],
    ["POST", suggest, "[1,2]"],
    ["POST", "/api/community/grammar/xx/suggestions", '{"kind":"retire","pattern":"niet","knows":"native"}'],
    ["POST", `/api/community/grammar-suggestions/${someone.id}/report`, '{"reason":{"toString":null}}'],
    ["POST", `/api/community/grammar-suggestions/${someone.id}/report`, `{"reason":"spam","details":"${"x".repeat(40000)}"}`],
    ["POST", "/api/community/grammar-suggestions/nope/like", ""],
    ["POST", "/api/community/grammar-suggestions/nope/withdraw", ""],
  ];
  for (const [method, path, body] of crafted) {
    const r = await send(method, path, body);
    const words = typeof r.body?.error === "string" || (Array.isArray(r.body?.problems) && r.body.problems.length > 0);
    assert((r.status === 400 || r.status === 422) && words, `${method} ${path} ${body.slice(0, 60)}: ${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
  }
  // Nothing crafted was kept: the learner's own suggestions are the ones made above.
  const mine = await must(learner.token, "grammar_suggestions", { mine: true });
  assert(mine.length === 2, JSON.stringify(mine.map((s) => [s.kind, s.pattern])));
  // A language in the body never overrides the route's: it's Dutch's grammar the suggestion goes to.
  const routed = await send("POST", suggest, '{"kind":"retire","pattern":"niet","knows":"native","language":"de"}');
  assert(routed.status === 200 && routed.body?.suggestion?.language === "nl", JSON.stringify(routed.body)?.slice(0, 200));
  await must(learner.token, "withdraw_pattern_suggestion", { id: routed.body.suggestion.id });
  const big = await send("POST", suggest, JSON.stringify({ kind: "new", name: "Big", about: "x".repeat(200_000), knows: "native" }));
  assert(big.status === 400, `a body past its limit: ${big.status}`);
  for (const path of ["/api/community/grammar/en", "/api/community/grammar/xx/suggestions", "/api/community/grammar-suggestions/nope"]) {
    const r = await send("GET", path);
    assert(r.status === 400 && r.body?.error, `${path}: ${r.status}`);
  }
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
if (problems.length) console.log(`\nconsole and page errors:\n  ${problems.join("\n  ")}`);
writeFileSync(join(OUT, "grammar-suggest-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
console.log(`\n${passed}/${results.length} stages passed${problems.length ? `, ${problems.length} console errors` : ""}`);
process.exit(passed === results.length && !problems.length ? 0 : 1);
