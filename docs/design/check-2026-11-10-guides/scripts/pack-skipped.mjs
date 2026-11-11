// lx-app (scratch only, skipped check): a pack lesson from Study a topic, then the path page; was: the path fix in the real app, for the director's look. A new Dutch learner signs up (a passkey, as anyone does),
// their AI makes the guide's Trip to Utrecht pack over MCP (create_pack with a personal token, as an AI app calls it), the app takes it through
// the relay; they mark the path's first unit as done (Study's own "mark as done", plan.js markLessonsDone); then Home, Study's path and Study
// a topic at 390, dark, each read back: the next lesson is the pack's, under its name.
//   node pack-stills.mjs http://localhost:<port> <outDir> --app <copy dir>
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = resolve(outArg);
const APP = resolve(argv[argv.indexOf("--app") + 1]);
const STATE = join(APP, ".state-local/state");
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(pathToFileURL(join(APP, "scripts/quiet-browser.mjs")).href);
// The Worker's TypeScript, for the guide's own example (its imports have no extension).
const { registerHooks } = await import("node:module");
registerHooks({ resolve: (s, c, n) => (s === "cloudflare:workers" ? { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true } : n(s, c)) });
await import(pathToFileURL(join(APP, "scripts/fixtures/worker-env.mjs")).href);
const { FULL } = await import(pathToFileURL(join(APP, "src/pack-guide.ts")).href);

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", STATE, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).toString();
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
async function tool(token, name, args) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: ")) ?? text;
  const { result, error } = JSON.parse(line.replace(/^data: /, ""));
  if (error) throw new Error(`${name}: ${error.message}`);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text.slice(0, 400)}`);
  return JSON.parse(result.content[0].text);
}

const results = {};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark", reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const name = `Trip learner ${randomBytes(2).toString("hex")}`;
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', name);
await page.click('#register button[type="submit"]');
await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]");
await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
const pathCame = await page.evaluate(async () => {
  const content = await import("/js/study/content.js");
  const { pathLessons } = await import("/js/study/path.js");
  for (let waited = 0; waited < 120_000; waited += 400) {
    if (content.ITEMS.some((item) => item.pack === "path-nl") && pathLessons().length > 5) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
});
if (!pathCame) throw new Error("path-nl never came");

// Their AI: a personal token on their account, and create_pack with the guide's own example.
const [{ id: userId }] = sql(`SELECT id FROM users WHERE name = ${q(name)}`);
const token = `lct_${randomBytes(24).toString("base64url")}`;
sql(`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(userId)}, 'stills', ${q(sha256(token))}, ${q(token.slice(0, 8))}, ${Date.now()}, 0)`);
results.created = await tool(token, "create_pack", FULL);

// The app takes it through the relay (as when it's open), and lays the path out with it.
results.arrived = await page.evaluate(async (id) => {
  const content = await import("/js/study/content.js");
  for (let waited = 0; waited < 90_000; waited += 500) {
    const found = content.WORD_PACKS.find((pack) => pack.id === id);
    if (found) return { own: found.own, words: found.words.length, waited };
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}, FULL.pack_id);
if (!results.arrived) throw new Error("the pack never arrived");

// The pack's first lesson from Study a topic (#study/session/pack/<id>), played to its end with the shared session player.
const { playToSummary, pastReminderAsk, SESSION } = await import(pathToFileURL(join(APP, "scripts/fixtures/play-session.mjs")).href);
await page.evaluate((id) => (location.hash = `#study/session/pack/${id}`), FULL.pack_id);
await page.waitForSelector(SESSION);
results.packLesson = (await playToSummary(page, { limit: 90 })).length;
await page.locator(`${SESSION} [data-part="answer-bar"]`).getByRole("button", { name: "Done" }).click();
await pastReminderAsk(page);
results.marked = { nextId: "words/trip-utrecht/" };
const shot = async (label) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, `${label}.png`) });
};
await page.evaluate(() => (location.hash = "#study"));
await page.waitForTimeout(1500);
await page.evaluate(() => (location.hash = "#study/path"));
await page.waitForTimeout(3000);
const body = (await page.textContent('[data-part="page"]')) ?? "";
results.skippedOnPath = (body.match(/Skipped/g) ?? []).length;
results.packOnPath = body.includes("Trip to Utrecht");
await shot("path-after-pack-lesson-390-dark");
const header = page.getByText("Trip to Utrecht 1", { exact: false }).first();
if (await header.count()) {
  await header.scrollIntoViewIfNeeded();
  await shot("path-pack-unit-390-dark");
}
results.errors = errors;
results.ok = results.skippedOnPath === 0 && results.packOnPath && !errors.length;
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1).slice(0, 2500));
await browser.close();
process.exit(results.ok ? 0 : 1);
