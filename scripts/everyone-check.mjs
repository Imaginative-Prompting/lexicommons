// Community actions open to everyone (a server started with --var COMMUNITY_SHARING:everyone: wrangler.jsonc's own is "admins"), done for real in Chrome by
// ordinary new accounts on phones, none an admin, each meeting the terms at their first contribution: asking for a pack
// (Ask for it), sharing a pack, suggesting a fix and flagging a sentence on someone else's pack, answering a request and
// suggesting a grammar pattern. Then what an admin sees over MCP: nothing waits for review until someone reports it, and each kind
// once reported, in the moderation queue with what it says. Then what someone not signed in can read. The old refusal
// ("Sharing in Explore opens to everyone soon") and the AI-facing words about the terms never show. LOCAL only: it writes
// an admin into the local D1.
// Usage: node scripts/everyone-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   (exit 0 = pass)
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/everyone-check.mjs http://localhost:<port> <outDir> --persist-to <dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
const admin = { id: `ev${randomBytes(6).toString("hex")}`, token: `lct_${randomBytes(24).toString("base64url")}` };
const now = Date.now();
sql([
  `INSERT INTO users (id, name, created_at) VALUES (${q(admin.id)}, 'Everyone Check Admin', ${now - 8 * 86_400_000})`,
  `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(admin.id)}, 'everyone-check', ${q(createHash("sha256").update(admin.token).digest("hex"))}, ${q(admin.token.slice(0, 10))}, ${now}, 1)`,
  `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(admin.id)}, 'admin', ${now}, 'd1', 'everyone-check')`,
].join("; "));

async function rpc(method, params) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
async function tool(name, args = {}) {
  const { result, error } = await rpc("tools/call", { name, arguments: args });
  if (error) throw new Error(`${name}: ${error.message}`);
  const text = result.content[0].text;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  if (result.isError) throw new Error(`${name}: ${text.slice(0, 400)}`);
  return value;
}

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const results = [];
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const pages = [];
async function stage(name, fn) {
  try {
    const note = (await fn()) ?? "";
    results.push({ name, ok: true, note });
    console.log(`ok    ${name}${note ? `: ${typeof note === "string" ? note : JSON.stringify(note)}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ name, ok: false, note: String(error.message ?? error) });
    console.log(`FAIL  ${name}: ${error.message}`);
    for (const [i, p] of pages.entries()) await p.screenshot({ path: join(OUT, `fail-${results.length}-${i}.png`) }).catch(() => {});
  }
}
const errors = [];
async function person(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  pages.push(page);
  return page;
}
const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  await page.evaluate(async () => {
    for (let waited = 0; waited < 1200; waited += 50) {
      if (document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== "running")) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }).catch(() => {});
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};
const sheet = (page) => page.locator('[data-part="sheet"]').last();
// Never the old refusal, or words about "the person" and "an AI" on someone's screen.
const clean = async (page, where) => {
  const words = await page.evaluate(() => document.body.innerText);
  assert(!/opens to everyone soon|only the library's admins|An AI can't|the person accepts/.test(words), `${where}: ${words.match(/.*(opens to everyone soon|only the library's admins|An AI can't|the person accepts).*/)?.[0]}`);
  assert(!/\bAI\b/.test(words.replace(/^\s*AI\s*$/gm, "")), `${where} names an AI: ${words.match(/.*\bAI\b.*/)?.[0]}`);
};
const hashOf = (page) => page.evaluate(() => location.hash);

const ana = await person("Ana Learner");
const ben = await person("Ben Sharer");
const cas = await person("Cas Fixer");
const dee = await person("Dee Patterner");
const ids = {};
// Each person meets the terms at their first contribution: asked there, once; what they wrote stays and goes on.
const askedTerms = async (page, where) => {
  await page.getByRole("button", { name: "I agree" }).waitFor({ timeout: 8000 });
  await clean(page, where);
};

await stage("Ask for it, a first time: the terms come up over the form; Not now keeps what's written", async () => {
  await go(ana, "#explore/requests?lang=nl");
  await ana.locator('[data-part="list-row"]', { hasText: /^Ask for a pack/ }).click();
  const s = sheet(ana);
  await s.locator('input[aria-label="What should it be about?"]').fill("A pack for a trip to Amsterdam");
  await s.getByRole("button", { name: "Ask for it" }).click();
  await askedTerms(ana, "the terms over Ask for it");
  await shot(ana, "01-post-it-terms-first");
  assert(!(await s.getByRole("button", { name: "Ask for it" }).isVisible()), "the form is behind the terms");
  assert(!/http|explore\/terms/.test(await s.innerText()), "an address on the sheet");
  await s.getByRole("button", { name: "Not now" }).click();
  await s.getByRole("button", { name: "Ask for it" }).waitFor();
  const kept = await s.locator('input[aria-label="What should it be about?"]').inputValue();
  assert(kept === "A pack for a trip to Amsterdam", `what's written: ${kept}`);
  const posted = await ana.evaluate(async () => (await (await fetch("/api/community/requests?language=nl")).json()));
  assert(!JSON.stringify(posted).includes("Amsterdam"), "Not now posted it");
  return "the form back, with its words; nothing posted";
});

await stage("Ask for it: agreed, and it goes on: asked for a pack, on the board", async () => {
  const s = sheet(ana);
  await s.getByRole("button", { name: "Ask for it" }).click();
  await s.getByRole("button", { name: "I agree" }).click();
  await ana.waitForFunction(() => /^#explore\/request\/./.test(location.hash), null, { timeout: 8000 });
  ids.request = (await hashOf(ana)).split("/").pop();
  await ana.getByText("A pack for a trip to Amsterdam").first().waitFor();
  await shot(ana, "03-post-it-posted");
  await clean(ana, "the request's page");
  return `request ${ids.request}`;
});

await stage("the terms' own page still says they're accepted", async () => {
  await go(ana, "#explore/terms");
  await ana.getByRole("button", { name: "Accepted" }).waitFor();
  await shot(ana, "02-terms-page");
  await clean(ana, "the terms' page");
});

await stage("Share: a new account's own pack goes into Explore, through the terms the first time", async () => {
  ids.pack = "ben-trip-dutch";
  const saved = await ben.evaluate(async (id) => {
    const { BUILT_IN } = await import("/js/packs/index.js");
    const pack = structuredClone(BUILT_IN.find((p) => p.language === "nl") ?? BUILT_IN[0]);
    pack.id = id;
    pack.name = "Dutch for the trip";
    pack.items = pack.items.map((item) => ({ ...item, means: `${item.means} (for the trip)` }));
    delete pack.builtIn;
    return (await import("/js/study/packs.js")).savePack(pack, { by: "the check" });
  }, ids.pack);
  assert(saved.ok, `saved: ${JSON.stringify(saved.errors)}`);
  await go(ben, `#settings/study/packs/${ids.pack}`);
  await ben.locator(".lx-row-title", { hasText: /^Share in Explore$/ }).click();
  // Sharing is a page of its own (explore.js renderShare): the terms first, then the form.
  await ben.waitForFunction(() => location.hash.startsWith("#explore/share/"), null, { timeout: 15_000 });
  await askedTerms(ben, "the terms before Share");
  await shot(ben, "04a-share-terms-first");
  await ben.getByRole("button", { name: "I agree" }).click();
  // The form (explore.js newForm): its name beside its cover, the four terms gone with the agreeing.
  await ben.locator('[data-part="page"]:visible .lx-share-head label[data-part="field"]', { hasText: "Its name in Explore" }).locator("input").waitFor();
  assert(!(await ben.locator('[data-part="page"]:visible ol.lx-terms').count()), "the terms still drawn over the form");
  await shot(ben, "04-share-page");
  await ben.getByRole("button", { name: "Share", exact: true }).click();
  await ben.waitForFunction(() => location.hash.startsWith("#explore/item/"), null, { timeout: 15_000 });
  ids.item = decodeURIComponent((await hashOf(ben)).split("?")[0].split("/").pop());
  await ben.locator('[data-part="page-title"]', { hasText: "Dutch for the trip" }).waitFor();
  await shot(ben, "05-shared");
  await clean(ben, "the shared pack's page");
  return `item ${ids.item}`;
});

await stage("Suggest a fix on someone else's pack, through the terms the first time", async () => {
  await cas.goto(`${BASE}/app/#explore/item/${ids.item}`);
  await cas.waitForSelector("html[data-app-ready]");
  // Corrections are a press away on a pack's page; Suggest a fix is on each sentence's …
  await cas.locator(".lx-quiet-more > summary", { hasText: "Corrections" }).click();
  await cas.locator(".lx-explore-corrections").getByText(/None yet|Suggested by/).waitFor();
  await cas.getByRole("button", { name: "More about this sentence" }).nth(0).click();
  await cas.getByRole("button", { name: /^Suggest a fix/ }).click();
  await cas.locator('textarea[aria-label="The natural line"]').fill("Better English for this line, from a learner.");
  await cas.getByRole("button", { name: "Send fix" }).click();
  await askedTerms(cas, "the terms over Suggest a fix");
  await shot(cas, "06a-fix-terms-first");
  await sheet(cas).getByRole("button", { name: "I agree" }).click();
  await cas.locator(".lx-settings-message", { hasText: /your fix is with its author/ }).waitFor();
  await shot(cas, "06-suggest-a-fix");
  await clean(cas, "after Suggest a fix");
});

await stage("Flag it on someone else's pack: no terms the second time", async () => {
  await cas.getByRole("button", { name: "More about this sentence" }).nth(1).click();
  await cas.getByRole("button", { name: /^Flag it/ }).click();
  await cas.locator('textarea[aria-label="What\'s wrong"]').fill("The literal line skips a word.");
  await cas.getByRole("button", { name: "Send flag" }).click();
  await cas.locator(".lx-settings-message", { hasText: /your flag is with its author/ }).waitFor();
  assert(!(await cas.getByRole("button", { name: "I agree" }).count()), "asked again");
  await shot(cas, "07-flag-it");
  await clean(cas, "after Flag it");
});

await stage("Answer: the pack's author answers the request with it, and its asker sees the answer", async () => {
  await ben.goto(`${BASE}/app/#explore/request/${ids.request}`);
  await ben.waitForSelector("html[data-app-ready]");
  await ben.getByRole("button", { name: /^Answer$/ }).click();
  await sheet(ben).locator('[data-part="list-row"]', { hasText: "Dutch for the trip" }).click();
  await ben.locator(".lx-settings-message", { hasText: /Answered: “Dutch for the trip” is under the request now/ }).waitFor();
  await shot(ben, "08-answered");
  await clean(ben, "after Answer");
  await ana.goto(`${BASE}/app/#explore/yours`);
  await ana.waitForSelector("html[data-app-ready]");
  await ana.locator('[data-part="list-row"]', { hasText: /A pack for a trip to Amsterdam.*1 answer, 1 new/ }).first().waitFor({ timeout: 10_000 });
  await shot(ana, "09-yours-sees-the-answer");
  await clean(ana, "Yours");
});

await stage("the pack's author has the fix and the flag to answer", async () => {
  const waiting = await ben.evaluate(async () => (await (await fetch("/api/community/corrections/to-answer")).json()));
  const list = waiting.corrections ?? waiting.items ?? waiting;
  const seen = JSON.stringify(list);
  assert(seen.includes("Better English for this line") && seen.includes("The literal line skips a word"), `to answer: ${seen.slice(0, 400)}`);
  return `${Array.isArray(list) ? list.length : "?"} to answer`;
});

await stage("Suggest a pattern in the language's grammar, through the terms the first time", async () => {
  await go(dee, "#explore/grammar/nl");
  await dee.getByRole("button", { name: "Suggest a new pattern" }).click();
  const s = sheet(dee);
  await s.getByLabel("Its name").fill("Zelf for emphasis");
  await s.getByLabel("Its explanation").fill("Put zelf after a word to stress it: ik doe het zelf (I do it self).");
  await s.getByText("I'm a learner").click();
  await s.getByRole("button", { name: "Send the suggestion" }).click();
  await askedTerms(dee, "the terms over Suggest a pattern");
  await shot(dee, "10a-pattern-terms-first");
  await s.getByRole("button", { name: "I agree" }).click();
  await dee.getByText("Sent: it waits for an admin.").waitFor({ timeout: 8000 });
  await shot(dee, "10-suggested-a-pattern");
  await clean(dee, "after suggesting a pattern");
});

await stage("what an admin sees before anyone reports: nothing is held for review", async () => {
  const pending = await (await fetch(`${BASE}/api/v1/mod/pending`, { headers: { Authorization: `Bearer ${admin.token}` } })).json();
  const queue = await tool("mod_queue");
  const cases = queue.cases ?? queue.items ?? queue;
  assert(Array.isArray(cases) ? !cases.length : !Object.keys(cases ?? {}).length, `already in the queue: ${JSON.stringify(queue).slice(0, 300)}`);
  const grammar = await tool("grammar_suggestions", { language: "nl" });
  const list = grammar.suggestions ?? grammar;
  assert(list.some((s) => /Zelf|zelf/.test(JSON.stringify(s))), `the grammar's suggestions: ${JSON.stringify(grammar).slice(0, 200)}`);
  return `pending ${JSON.stringify(pending)}; the queue empty; the grammar's open suggestions ${list.length}`;
});

await stage("reported: each kind reaches the moderation queue, with what it says", async () => {
  const report = (page, path, reason = "spam") => page.evaluate(async ({ path, reason }) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, details: "Reported by everyone-check." }) });
    return { status: r.status, body: await r.text() };
  }, { path, reason });
  const corrections = await ben.evaluate(async (item) => (await (await fetch(`/api/community/items/${encodeURIComponent(item)}/corrections`)).json()), ids.item);
  const flag = (corrections.corrections ?? corrections).find((c) => c.kind === "flag") ?? (corrections.corrections ?? corrections)[0];
  const grammar = await dee.evaluate(async () => (await (await fetch("/api/community/grammar-suggestions/mine")).json()));
  const suggestion = (grammar.suggestions ?? grammar)[0];
  const sent = {
    pack: await report(ana, `/api/community/items/${encodeURIComponent(ids.item)}/report`),
    request: await report(ben, `/api/community/requests/${ids.request}/report`),
    correction: await report(ben, `/api/community/corrections/${flag.id}/report`),
    grammar: await report(ben, `/api/community/grammar-suggestions/${suggestion.id}/report`),
  };
  for (const [kind, r] of Object.entries(sent)) assert(r.status === 200, `${kind}: ${r.status} ${r.body.slice(0, 200)}`);
  const pending = await (await fetch(`${BASE}/api/v1/mod/pending`, { headers: { Authorization: `Bearer ${admin.token}` } })).json();
  const queue = await tool("mod_queue");
  const cases = queue.cases ?? queue.items ?? queue;
  writeFileSync(join(OUT, "mod-queue.json"), JSON.stringify(queue, null, 1));
  const kinds = cases.map((c) => c.kind ?? c.target_kind ?? c.type);
  for (const kind of ["reports", "request", "correction", "grammar"]) assert(kinds.includes(kind), `the queue's kinds: ${kinds.join(", ")}; ${JSON.stringify(queue).slice(0, 400)}`);
  // Each case in full: the admin reads what was written, who wrote it and the report.
  const details = {};
  for (const c of cases) details[c.kind] = await tool("mod_get", c.item ? { id: c.item } : c.correction ? { correction: c.correction } : c.request ? { request: c.request } : { grammar: c.grammar });
  writeFileSync(join(OUT, "mod-get.json"), JSON.stringify(details, null, 1));
  for (const [kind, words] of [["reports", "Dutch for the trip"], ["request", "A pack for a trip to Amsterdam"], ["correction", "The literal line skips a word"], ["grammar", "Zelf for emphasis"]]) {
    const seen = JSON.stringify(details[kind]);
    assert(seen.includes(words), `mod_get ${kind} doesn't show "${words}": ${seen.slice(0, 300)}`);
    assert(seen.includes("Reported by everyone-check."), `mod_get ${kind} doesn't show the report: ${seen.slice(0, 300)}`);
  }
  return `pending ${JSON.stringify(pending)}; the queue: ${kinds.join(", ")}`;
});

await stage("what someone not signed in can read (with the gate off, as here)", async () => {
  const anon = {};
  const version = await ben.evaluate(async (id) => (await (await fetch(`/api/community/items/${encodeURIComponent(id)}`)).json()).item.version, ids.item);
  assert(version, "the pack's version");
  for (const path of ["/api/community/explore?lang=nl", `/api/community/items/${encodeURIComponent(ids.item)}`, `/api/community/requests?language=nl`, `/api/community/requests/${ids.request}`, "/api/community/grammar/nl", `/library/packs/${encodeURIComponent(ids.item)}/${version}/pack.json`, "/library/catalogue.json"]) {
    anon[path] = (await fetch(`${BASE}${path}`, { redirect: "manual" })).status;
  }
  writeFileSync(join(OUT, "anonymous.json"), JSON.stringify(anon, null, 1));
  const open = Object.entries(anon).filter(([, status]) => status < 300).map(([path]) => path);
  const catalog = await (await fetch(`${BASE}/library/catalogue.json`)).text();
  const packFile = await (await fetch(`${BASE}/library/packs/${encodeURIComponent(ids.item)}/${version}/pack.json`)).text();
  return `readable with no account: ${open.join(", ") || "nothing"}; the catalog names the shared pack: ${catalog.includes(ids.item)}; its author's name in the pack's file: ${packFile.includes("Ben Sharer")}`;
});

await stage("no page errors", () => assert(!errors.length, errors.slice(0, 3).join(" | ")));

await browser.close();
writeFileSync(join(OUT, "everyone-check.json"), JSON.stringify({ results, ids }, null, 1));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
console.log(failed ? `${failed} FAILED` : "all passed");
await new Promise((r) => setTimeout(r, 100));
process.exit(failed ? 1 : 0);
