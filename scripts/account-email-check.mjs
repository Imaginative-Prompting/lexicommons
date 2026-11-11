// An email on the account, end to end in Chrome on a phone (src/account-email.ts, shell/settings-email.js, the sign-in page's way back in):
// Settings → Account → Email adding one by the 6-digit code sent to it (read from the server's log: under wrangler dev no email goes
// anywhere, each one is written there), Remove asking twice; a phone that lost its passkey getting back in from the sign-in page with the
// address and its code, then adding a passkey on that phone and signing in with it next time; an address on no account answered exactly
// alike, with no email sent; five wrong codes and the code is done; every field 16px; the export holding the address and deleting the
// account taking it; pictures at 390 in Graphite and Paper. --off: a server started with EMAIL_FROM empty (a copy that sends no email)
// shows none of it, and its routes refuse. LOCAL only.
// Usage: node scripts/account-email-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --server-log <file> [--off]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const LOG = opt("server-log") && resolve(opt("server-log"));
const OFF = argv.includes("--off");
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST || (!OFF && !LOG)) {
  console.error("Usage: node scripts/account-email-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --server-log <file> [--off] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
const opened = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    const page = opened.at(-1)?.pages()[0];
    if (page && !page.isClosed()) await page.screenshot({ path: join(OUT, `fail-${results.length + 1}.png`) }).catch(() => {});
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 10).join("\n        ")}`);
  } finally {
    for (const context of opened.splice(0)) await context.close().catch(() => {});
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const run = randomBytes(3).toString("hex");

// The emails the server "sent": each one wrangler dev logged, with its subject and to. Only ones logged after `since` (an offset in the log).
const logLength = () => (LOG ? readFileSync(LOG, "utf8").length : 0);
function mailSince(since) {
  const text = readFileSync(LOG, "utf8").slice(since).replace(/\x1b\[[0-9;]*m/g, "");
  return [...text.matchAll(/send_email binding called with MessageBuilder:([\s\S]*?)(?=send_email binding called|$)/g)].map((m) => ({
    to: m[1].match(/To:\s*([^\s,]+@[^\s,]+)/i)?.[1]?.toLowerCase() ?? null,
    subject: m[1].match(/Subject:\s*(.+)/i)?.[1]?.trim() ?? "",
  }));
}
async function codeFor(address, since, { within = 8000 } = {}) {
  const until = Date.now() + within;
  while (Date.now() < until) {
    const found = mailSince(since).find((m) => m.to === address && /\b\d{6}\b/.test(m.subject));
    if (found) return { code: found.subject.match(/\b(\d{6})\b/)[1], subject: found.subject };
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no code reached ${address} (mail since: ${JSON.stringify(mailSince(since)).slice(0, 300)})`);
}

/** Goes to the Account page and returns its Email row's text as first drawn: read as the row is put in the page, before anything it fetches. */
async function accountRowAsDrawn(page) {
  await page.evaluate(() => {
    window.lxRowDrawn = null;
    const seen = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes) {
          const row = node.nodeType === 1 && (node.matches('a[href="#settings/account/email"]') ? node : node.querySelector('a[href="#settings/account/email"]'));
          if (row && window.lxRowDrawn === null) {
            window.lxRowDrawn = row.textContent;
            seen.disconnect();
            return;
          }
        }
    });
    seen.observe(document.body, { childList: true, subtree: true });
    location.hash = "#settings/account";
  });
  await page.waitForFunction(() => window.lxRowDrawn !== null, null, { timeout: 10_000 });
  return page.evaluate(() => window.lxRowDrawn);
}

const browser = await chromium.launch();
/** A phone with its own passkey store (Chrome's virtual authenticator): a new account on it, or none. */
async function phone({ signUp = null, theme = "graphite", width = 390, height = 844 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  opened.push(context);
  await context.addInitScript((theme) => {
    try {
      if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme, presets: {} }));
    } catch {}
  }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => (errors.push(`a dialog: ${dialog.message()}`), dialog.dismiss().catch(() => {})));
  const authn = await context.newCDPSession(page);
  await authn.send("WebAuthn.enable");
  const { authenticatorId } = await authn.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  const passkeys = async () => (await authn.send("WebAuthn.getCredentials", { authenticatorId })).credentials.length;
  if (signUp) {
    await page.goto(`${BASE}/app/`);
    await page.waitForURL(/\/login\?next=/);
    await page.click("summary");
    await page.fill('input[name="name"]', signUp);
    await page.click('#register button[type="submit"]');
    await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  }
  return { context, page, errors, passkeys };
}
const userIdOf = (page) => page.evaluate(async () => (await (await fetch("/api/me")).json()).user.id);
const fontPx = (locator) => locator.evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
// Adds an address to the signed-in account through Settings → Account → Email, the whole way.
async function addThroughSettings(page, address) {
  await page.evaluate(() => (location.hash = "#settings/account/email"));
  const field = page.locator('[data-page] input[name="email"], input[name="email"]').first();
  await field.waitFor({ timeout: 10_000 });
  assert((await fontPx(field)) >= 16, "the email field is under 16px");
  const since = logLength();
  await field.fill(address);
  await page.getByRole("button", { name: "Send a code" }).click();
  const { code } = await codeFor(address, since);
  const box = page.locator('input[name="code"]');
  await box.waitFor({ timeout: 5000 });
  assert((await fontPx(box)) >= 16, "the code field is under 16px");
  await box.fill(code);
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByText(`${address} is on your account`).waitFor({ timeout: 5000 });
  return code;
}

if (OFF) {
  await stage("a site that sends no email: no way back in by email on the sign-in page, its page goes to sign-in, no Email in Settings, and its routes refuse", async () => {
    const { page } = await phone({ signUp: `Off ${run}` });
    const me = await page.evaluate(async () => (await (await fetch("/api/me")).json()).email);
    assert(me && me.offered === false, `/api/me's email: ${JSON.stringify(me)}`);
    await page.evaluate(() => (location.hash = "#settings/account"));
    await page.waitForTimeout(800);
    assert(!(await page.locator('[data-part="list-row"] .lx-row-title', { hasText: /^Email$/ }).count()), "an Email row on a site that sends none");
    const routes = await page.evaluate(async () => {
      const call = async (method, path, body) => (await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) })).status;
      return [await call("POST", "/api/account/email", { email: "a@example.com" }), await call("POST", "/api/recover", { email: "a@example.com" }), await call("POST", "/api/recover/confirm", { id: "abcdefgh", code: "123456" })];
    });
    assert(routes.every((s) => s === 404), `routes: ${routes}`);
    const fresh = await phone();
    await fresh.page.goto(`${BASE}/login`);
    assert(!(await fresh.page.locator("#recover-link").count()), "the sign-in page offers a way back in by email");
    await fresh.page.goto(`${BASE}/login/recover`);
    assert(/\/login(\?|$)/.test(new URL(fresh.page.url()).pathname + new URL(fresh.page.url()).search) && !(await fresh.page.locator("#recover").count()), `the page: ${fresh.page.url()}`);
    return routes.join(", ");
  });
} else {
  const address = `ana.${run}@example.com`;
  let anaId = null;

  await stage("Settings → Account → Email: what it's for, adding one by the code sent to it, the Account page naming it, Remove asking twice", async () => {
    const { page, errors } = await phone({ signUp: `Ana ${run}` });
    anaId = await userIdOf(page);
    await page.evaluate(() => (location.hash = "#settings/account"));
    const row = page.locator('a[href="#settings/account/email"]');
    await row.waitFor({ timeout: 10_000 });
    assert((await row.innerText()).includes("None"), `the row before: ${await row.innerText()}`);
    await row.click();
    await page.getByText("For getting back in if you lose your passkey").waitFor({ timeout: 10_000 });
    await page.screenshot({ path: join(OUT, "email-empty-graphite-390.png") });
    // What it's for is a press away, in a sheet: receipts named only where this site offers the plan (/api/me's features.plan).
    const plan = await page.evaluate(() => Boolean(JSON.parse(localStorage.getItem("lx.me.v1") ?? "null")?.me?.features?.plan));
    const title = await page.getByText("For getting back in if you lose your passkey").innerText();
    assert(/receipts/.test(title) === plan, `the page's line with the plan ${plan ? "offered" : "off"}: ${title}`);
    await page.getByText("What it's for", { exact: true }).click();
    const words = page.getByText("Only for getting back into your account");
    await words.waitFor({ timeout: 10_000 });
    const said = await words.innerText();
    assert(/receipts/.test(said) === plan, `what it's for with the plan ${plan ? "offered" : "off"}: ${said}`);
    await page.keyboard.press("Escape");
    await words.waitFor({ state: "hidden", timeout: 10_000 });
    await addThroughSettings(page, "first." + address);
    // Changing it: the old one told.
    const since = logLength();
    await addThroughSettings(page, address);
    // The old address is told after the answer (it never decides it): wait for it.
    let told = null;
    for (let i = 0; i < 40 && !told; i++) {
      told = mailSince(since).find((m) => m.to === "first." + address && /was changed/.test(m.subject));
      if (!told) await page.waitForTimeout(200);
    }
    assert(told, `the old address wasn't told: ${JSON.stringify(mailSince(since))}`);
    await page.screenshot({ path: join(OUT, "email-set-graphite-390.png") });
    // Remove asks once on the button, then takes it; added back for the stages after.
    const remove = page.getByRole("button", { name: /^Remove/ });
    await remove.click();
    assert(/can't get back in by email/.test(await remove.innerText()), `Remove's second ask: ${await remove.innerText()}`);
    assert(sql(`SELECT email FROM account_emails WHERE user_id = ${q(anaId)}`).length === 1, "removed on the first press");
    await remove.click();
    await page.getByText("Email removed").waitFor({ timeout: 5000 });
    assert(sql(`SELECT email FROM account_emails WHERE user_id = ${q(anaId)}`).length === 0, "not removed");
    await addThroughSettings(page, address);
    // The Account page names it as soon as it's drawn, never the old value first with a fetch correcting it a moment later (v96–v97: "None").
    const drawn = await accountRowAsDrawn(page);
    assert(drawn.includes(address), `the Account page's row as first drawn: ${drawn}`);
    await row.waitFor({ timeout: 5000 });
    // Only the address is kept, and no code in the clear.
    const kept = sql(`SELECT * FROM email_codes WHERE user_id = ${q(anaId)}`);
    assert(kept.length === 0, `codes left once confirmed: ${kept.length}`);
    assert(!errors.length, `page errors: ${errors}`);
    return address;
  });

  await stage("a phone that lost its passkey: the sign-in page's way back in, the address, its code, then a passkey on this phone, and signing in with it next time", async () => {
    const { page, errors, passkeys } = await phone();
    await page.goto(`${BASE}/app/`);
    await page.waitForURL(/\/login\?next=/);
    const link = page.locator("#recover-link a");
    await link.waitFor({ timeout: 5000 });
    await link.click();
    await page.waitForURL(/\/login\/recover/);
    const field = page.locator('#recover-email input[name="email"]');
    assert((await fontPx(field)) >= 16, "the email field is under 16px");
    await page.screenshot({ path: join(OUT, "recover-graphite-390.png") });
    const since = logLength();
    await field.fill(address.toUpperCase());
    await page.click('#recover-email button[type="submit"]');
    await page.locator("#recover-code").waitFor({ state: "visible", timeout: 5000 });
    const { code, subject } = await codeFor(address, since);
    assert(/get back into Lexicommons/.test(subject), subject);
    const box = page.locator('#recover-code input[name="code"]');
    assert((await fontPx(box)) >= 16, "the code field is under 16px");
    await box.fill(code);
    await page.click('#recover-code button[type="submit"]');
    await page.locator("#recover-passkey").waitFor({ state: "visible", timeout: 5000 });
    await page.screenshot({ path: join(OUT, "recover-in-graphite-390.png") });
    assert((await userIdOf(page)) === anaId, "signed in, but not as the account with that address");
    let told = null;
    for (let i = 0; i < 40 && !told; i++) {
      told = mailSince(since).find((m) => m.to === address && /got back into Lexicommons/.test(m.subject));
      if (!told) await page.waitForTimeout(200);
    }
    assert(told, "the address wasn't told it was used");
    assert((await passkeys()) === 0, "this phone had a passkey already");
    await page.click("#recover-add");
    await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
    assert((await passkeys()) === 1, "no passkey was made on this phone");
    // Next time: signed out, then in with that passkey. Out of the app first: signed out under it, the app's next call gets a 401 and it goes to
    // sign-in by itself, which would cut this page's own move there short.
    await page.goto(`${BASE}/privacy`);
    await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
    await page.goto(`${BASE}/login`);
    await page.click("#signin");
    await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
    assert((await userIdOf(page)) === anaId, "the new passkey signed into another account");
    assert(!errors.length, `page errors: ${errors}`);
    return "back in, a passkey on this phone, signed in with it";
  });

  await stage("an address on no account: the same page and words, no email sent, its code refused as a wrong one is", async () => {
    const { page } = await phone();
    const words = async (who) => {
      await page.goto(`${BASE}/login/recover`);
      const since = logLength();
      await page.fill('#recover-email input[name="email"]', who);
      await page.click('#recover-email button[type="submit"]');
      await page.locator("#recover-code").waitFor({ state: "visible", timeout: 5000 });
      const said = (await page.locator("#recover-sent").innerText()).trim();
      await page.fill('#recover-code input[name="code"]', "000000");
      await page.click('#recover-code button[type="submit"]');
      await page.locator("#auth-error:not([hidden])").waitFor({ timeout: 5000 });
      const refused = (await page.locator("#auth-error").innerText()).trim();
      await page.waitForTimeout(1500);
      return { said, refused, mail: mailSince(since).filter((m) => m.to === who.toLowerCase()).length };
    };
    const known = await words(address);
    const unknown = await words(`nobody.${run}@example.com`);
    assert(known.said === unknown.said, `what's said differs: ${known.said} | ${unknown.said}`);
    assert(known.refused === unknown.refused, `a wrong code's answer differs: ${known.refused} | ${unknown.refused}`);
    assert(known.mail === 1 && unknown.mail === 0, `emails sent: known ${known.mail}, unknown ${unknown.mail}`);
    return unknown.said;
  });

  await stage("five wrong codes and the code is done, even the right one; a new code works", async () => {
    // Its own account and address: an address gets 5 codes an hour (email_sends), and the stages before have sent Ana's most of hers.
    const di = await phone({ signUp: `Di ${run}` });
    const diAddress = `di.${run}@example.com`;
    await addThroughSettings(di.page, diAddress);
    const { page } = await phone();
    await page.goto(`${BASE}/login/recover`);
    const since = logLength();
    await page.fill('#recover-email input[name="email"]', diAddress);
    await page.click('#recover-email button[type="submit"]');
    const { code } = await codeFor(diAddress, since);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await page.fill('#recover-code input[name="code"]', wrong);
      await page.click('#recover-code button[type="submit"]');
      await page.waitForTimeout(400);
    }
    await page.fill('#recover-code input[name="code"]', code);
    await page.click('#recover-code button[type="submit"]');
    await page.waitForTimeout(800);
    assert(/can't be used any more/.test(await page.locator("#auth-error").innerText()), `after five: ${await page.locator("#auth-error").innerText()}`);
    assert(await page.locator("#recover-passkey").isHidden(), "the right code still got in after five wrong ones");
    await page.click("#recover-again");
    const since2 = logLength();
    await page.fill('#recover-email input[name="email"]', diAddress);
    await page.click('#recover-email button[type="submit"]');
    const fresh = await codeFor(diAddress, since2);
    await page.fill('#recover-code input[name="code"]', fresh.code);
    await page.click('#recover-code button[type="submit"]');
    await page.locator("#recover-passkey").waitFor({ state: "visible", timeout: 5000 });
    const status = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
    assert(status === 200, `deleting Di's account: ${status}`);
    return "done after five; a new one got in";
  });

  await stage("another site can't sign you in with a code it holds (login CSRF): its form refused, no session; the code still works here", async () => {
    // Someone asks for a code to their own address, then puts it in a form on their own site for a visitor to send.
    const { page } = await phone({ signUp: `Cy ${run}` });
    const cy = await userIdOf(page);
    const cyAddress = `cy.${run}@example.com`;
    await addThroughSettings(page, cyAddress);
    const since = logLength();
    const asked = await fetch(`${BASE}/api/recover`, { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json" }, body: JSON.stringify({ email: cyAddress }) });
    assert(asked.status === 200, `asking from the site: ${asked.status}`);
    const { id } = await asked.json();
    const { code } = await codeFor(cyAddress, since);
    const body = JSON.stringify({ id, code });
    for (const [what, headers] of [
      ["another site's text/plain form", { Origin: "https://elsewhere.example", "Content-Type": "text/plain" }],
      ["no Origin", { "Content-Type": "application/json" }],
    ]) {
      const response = await fetch(`${BASE}/api/recover/confirm`, { method: "POST", headers, body });
      assert(response.status === 403 && !response.headers.get("set-cookie"), `${what}: ${response.status}, cookie ${Boolean(response.headers.get("set-cookie"))}`);
    }
    const elsewhereAsks = await fetch(`${BASE}/api/recover`, { method: "POST", headers: { Origin: "https://elsewhere.example", "Content-Type": "text/plain" }, body: JSON.stringify({ email: cyAddress }) });
    assert(elsewhereAsks.status === 403, `another site asking for a code: ${elsewhereAsks.status}`);
    const here = await fetch(`${BASE}/api/recover/confirm`, { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json" }, body });
    assert(here.status === 200 && /lc_session|session/i.test(here.headers.get("set-cookie") ?? ""), `from the site: ${here.status}`);
    const status = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
    assert(status === 200 && sql(`SELECT 1 FROM users WHERE id = ${q(cy)}`).length === 0, `Cy's account left: ${status}`);
    return "refused from elsewhere and with no Origin; the same code in from the site";
  });

  await stage("light theme pictures, the export holding the address, and deleting the account taking it", async () => {
    const light = await phone({ theme: "paper" });
    await light.page.goto(`${BASE}/login/recover`);
    await light.page.waitForTimeout(600);
    await light.page.screenshot({ path: join(OUT, "recover-paper-390.png") });
    const { page } = await phone({ signUp: `Bo ${run}`, theme: "paper" });
    const bo = await userIdOf(page);
    await addThroughSettings(page, `bo.${run}@example.com`);
    await page.screenshot({ path: join(OUT, "email-set-paper-390.png") });
    const exported = await page.evaluate(async () => (await (await fetch("/api/me/export")).json()).email);
    assert(exported?.email === `bo.${run}@example.com`, `the export's email: ${JSON.stringify(exported)}`);
    const status = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
    assert(status === 200, `delete: ${status}`);
    assert(sql(`SELECT 1 FROM account_emails WHERE user_id = ${q(bo)} UNION ALL SELECT 1 FROM email_codes WHERE user_id = ${q(bo)}`).length === 0, "rows left after the account went");
    return "exported, then gone with the account";
  });
}

await browser.close().catch(() => {});
writeFileSync(join(OUT, "account-email-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`account email check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
