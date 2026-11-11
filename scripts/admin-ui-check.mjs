#!/usr/bin/env node
// What an admin sees in the app, in Chrome against a LOCAL server: Settings → Your AI offers "Admin access" on a new
// personal token to an admin only (the role read from /api/me), a token made with it reaches the admin tools and is
// listed as such, and one made without it doesn't; a learner never sees the switch, and nor does an admin seeing the app as a learner
// (Settings → Admin's switch, on until it's turned off on the device: shell/sharing.js learnerView). Accounts are written straight
// into the server's D1 state (signed in by a session cookie, no passkey ceremony), then deleted through the API.
//
//   node scripts/admin-ui-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// Exit 0 = pass. Run through the channel's GPU queue (headless Chrome), sandbox off (wrangler).

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
// Absolute, whatever folder it's run from (app/AGENTS.md: every check resolves its outDir first).
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? argv[argv.indexOf("--persist-to") + 1] : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: admin-ui-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
function account(name, admin) {
  const id = `ui${randomBytes(6).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'admin-ui-check')`,
      ...(admin ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'admin-ui-check')`] : []),
    ].join("; "),
  );
  return { id, name, cookie };
}

const results = [];
const stage = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ok    ${name}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`  FAIL  ${name}: ${error.message}`);
  }
};
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const errors = [];
// adminView: the learner view turned off on this device first (an admin sees the app as an admin only then).
async function signedIn(who, { adminView = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE }]);
  if (adminView) await context.addInitScript(() => localStorage.setItem("lx.learnerView.v1", "off"));
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${who.name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${who.name}: ${e}`));
  await page.goto(`${BASE}/app/#settings/ai`);
  await page.locator(".lx-quiet-more > summary", { hasText: "Personal tokens" }).click(); // a press away on that page
  await page.waitForSelector('input[aria-label="New personal token\'s name"]');
  // /api/me answers after the page is drawn: give the switch its chance to appear.
  await page.waitForLoadState("networkidle");
  return { context, page };
}
const mcpTools = async (token) => {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const line = (await response.text()).split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(line.slice(6)).result.tools.map((t) => t.name);
};

const admin = account("Admin Check", true);
const learner = account("Learner Check", false);

await stage("an admin seeing the app as a learner (the default) isn't offered Admin access", async () => {
  const { context, page } = await signedIn(admin);
  await page.waitForTimeout(500);
  const shown = await page.locator(".lx-row-title", { hasText: /^Admin access$/ }).count() && (await page.locator(".lx-row-title", { hasText: /^Admin access$/ }).isVisible());
  assert(!shown, "Admin access is offered with the learner view on");
  await page.screenshot({ path: join(OUT, "admin-learner-view.png"), fullPage: true });
  await context.close();
});

await stage("an admin's Settings → Your AI offers Admin access on a new token, with the learner view off", async () => {
  const { context, page } = await signedIn(admin, { adminView: true });
  const row = page.locator(".lx-row-title", { hasText: /^Admin access$/ });
  await row.waitFor({ state: "visible", timeout: 10_000 });
  await page.screenshot({ path: join(OUT, "admin-your-ai.png"), fullPage: true });
  // With the switch on: the token reaches the admin tools, and the list says so.
  await page.fill('input[aria-label="New personal token\'s name"]', "publishing script");
  await page.locator("label", { has: row }).click();
  assert(await page.locator('input[part="switch"], input[data-part="switch"]').first().isChecked(), "the switch is on after a press anywhere on its row");
  await page.getByRole("button", { name: "Create token" }).click();
  await page.waitForSelector(".lx-secret");
  const adminToken = (await page.locator(".lx-secret").textContent()).trim();
  await page.waitForFunction(() => document.body.textContent.includes("admin access ·"));
  assert(!(await page.locator('input[data-part="switch"]').first().isChecked()), "the switch is off again for the next token");
  // Without it: an ordinary token.
  await page.fill('input[aria-label="New personal token\'s name"]', "ordinary script");
  await page.getByRole("button", { name: "Create token" }).click();
  await page.waitForFunction((first) => document.querySelector(".lx-secret")?.textContent.trim() !== first, adminToken);
  const plainToken = (await page.locator(".lx-secret").textContent()).trim();
  await page.screenshot({ path: join(OUT, "admin-tokens.png"), fullPage: true });
  const [withAdmin, without] = await Promise.all([mcpTools(adminToken), mcpTools(plainToken)]);
  assert(withAdmin.includes("library_publish"), "the admin-access token reaches the admin tools");
  assert(!without.includes("library_publish"), "the ordinary token doesn't");
  const marked = await page.locator(".lx-row-sub", { hasText: "admin access" }).count();
  assert(marked === 1, `one token is listed with admin access (${marked})`);
  await context.close();
  return { adminTools: withAdmin.filter((n) => n.startsWith("library_") || n.startsWith("admin_")).length };
});

await stage("a learner never sees the switch", async () => {
  const { context, page } = await signedIn(learner);
  await page.waitForTimeout(500);
  assert((await page.locator(".lx-row-title", { hasText: /^Admin access$/ }).count()) === 0 || !(await page.locator(".lx-row-title", { hasText: /^Admin access$/ }).isVisible()), "Admin access is visible to a learner");
  await page.screenshot({ path: join(OUT, "learner-your-ai.png"), fullPage: true });
  await context.close();
});

await stage("no console errors", async () => {
  if (errors.length) throw new Error(errors.slice(0, 10).join("\n"));
});

for (const who of [admin, learner]) {
  await fetch(`${BASE}/api/me`, { method: "DELETE", headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) });
}
await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "admin-ui-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2) + "\n");
console.log(`admin ui check: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
