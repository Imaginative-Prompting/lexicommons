// lx-app (scratch only): the path fix in the real app, for the director's look. A new Dutch learner signs up (a passkey, as anyone does),
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

// An AI connected: a personal token on their account (an account with one counts as having an AI connected).
const [{ id: userId }] = sql(`SELECT id FROM users WHERE name = ${q(name)}`);
const token = `lct_${randomBytes(24).toString("base64url")}`;
sql(`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(userId)}, 'Claude', ${q(sha256(token))}, ${q(token.slice(0, 8))}, ${Date.now()}, 0)`);
await tool(token, "whoami", {});
await page.reload();
await page.waitForSelector("html[data-app-ready]");
await page.waitForTimeout(2000);
results.pages = {};
for (const [label, hash] of [["ai", "#ai"], ["ai-pack-new", "#ai/new/pack_new"], ["ai-text-new", "#ai/new/text_new"], ["ai-look", "#ai/new/look"], ["ai-connect", "#ai/connect"]]) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(2500);
  results.pages[label] = (await page.textContent('[data-part="page"]'))?.replace(/\s+/g, " ").slice(0, 2500);
  await page.screenshot({ path: join(OUT, `${label}-390-dark.png`) });
  if (label === "ai") {
    await page.getByText("Weave a text", { exact: true }).click();
    await page.waitForTimeout(2000);
    results.weaveRow = { hash: await page.evaluate(() => location.hash), title: (await page.textContent('[data-part="page"]'))?.replace(/\s+/g, " ").slice(0, 120) };
    await page.screenshot({ path: join(OUT, "weave-row-opens-390-dark.png") });
  }
  if (label === "ai-connect") {
    await page.getByText("Talk about what you're learning", { exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByText("Or ask it to make something", { exact: false }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "ai-connect-asks-390-dark.png") });
  }
}
results.errors = errors;
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
for (const [label, text] of Object.entries(results.pages)) console.log(`== ${label}\n${text}\n`);
await browser.close();
process.exit(0);
