// New accounts paused (the SIGNUPS switch, src/signups.ts; launch day's SHED step 1) end to end, on a LOCAL server: the switch set over REST by
// an admin's token, as the director sets it; a phone in Chrome with a virtual passkey and the stand-in providers (scripts/auth-standin.mjs,
// started here). Paused: the sign-in page and Start learning's (?new=1) say so in place of the create form, in the phone's light and dark, at
// 390 and 320; a passkey sign-up's first step answers 503 in words (code signups_paused, Retry-After) with nothing counted or written; a page
// loaded before the pause shows the words and asks the device for no passkey; a sign-up whose options came before the pause still finishes; a
// new Google sign-in gets the words with nothing written, a linked one signs in; an existing account's passkey signs in and its session
// answers; a create step reached before the pause shows the words, writes nothing, and finishes once open again. Then open: a sign-up goes
// through. With --server-log, the watch's lines (lx-watch signup, signups_paused) counted against what happened. The app before the switch
// fails it (there's no SIGNUPS to set). It makes accounts: LOCAL only, a fresh state.
//
// Local server: as auth-check's header (the stand-in vars), plus wrangler.jsonc's own SIGNUPS ("open"):
//   COPY=pN EXTRA="--var AUTH_STANDIN:http://localhost:8829 --var GOOGLE_SIGNIN_CLIENT_ID:standin-google-client \
//     --var GOOGLE_SIGNIN_CLIENT_SECRET:standin-google-secret --var GITHUB_CLIENT_ID:standin-github-client \
//     --var GITHUB_CLIENT_SECRET:standin-github-secret" LOGLEVEL=log scratch/lex-selfhost/paid/tools/copy-server.sh <port> public off
//   (--log-level log: wrangler dev writes the Worker's console.log into its log only from "log" on, not at "info")
//   node scripts/signups-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--standin-port 8829] [--server-log <file>]
//   (headless Chrome: through gpu.py's parallel lane; exit 0 = pass)
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const opt = (name, dflt) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : dflt);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const STANDIN_PORT = Number(opt("standin-port", "8829"));
const SERVER_LOG = opt("server-log") && resolve(opt("server-log"));
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !PERSIST) {
  console.error("Usage: node scripts/signups-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--standin-port 8829] [--server-log <file>] (LOCAL only)");
  process.exit(2);
}
const OUT = resolve(outArg ?? "signups-check-out");
mkdirSync(join(OUT, "shots"), { recursive: true });
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORDS = "We're very busy right now. Try again in a few minutes.";
const HAVE = "If you already have an account, sign in as usual.";

const results = [];
const problems = [];
// A console line a stage expects (Chrome's own "Failed to load resource" for the 503 a paused sign-up answers), allowed only in that stage.
let expected = null;
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (v) => (typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], {
    cwd: APP,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
/**
 * What a sign-up writes: accounts, ways in, and its one-time rows (a passkey sign-up's challenge, a provider's pending sign-in). A provider's
 * own round trip (its "oauth" row, made and taken) and the sweep of expired rows aren't a sign-up's, so they aren't counted.
 */
const counts = () =>
  sql(
    "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM identities) AS identities, (SELECT COUNT(*) FROM passkeys) AS passkeys, (SELECT COUNT(*) FROM challenges WHERE kind IN ('register', 'pending')) AS onetime",
  )[0];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- the director's switch, over REST ----------
const RUN = Date.now().toString(36);
const TOKEN = `lct_${randomBytes(24).toString("hex")}`;
{
  const now = Date.now();
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES ('signups-admin-${RUN}', 'Signups admin', ${now})`,
      `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES ('signups-admin-${RUN}', 'admin', ${now}, 'd1', 'signups-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES ('st${RUN}', 'signups-admin-${RUN}', 'signups-check', ${q(createHash("sha256").update(TOKEN).digest("hex"))}, ${q(TOKEN.slice(0, 10))}, ${now}, 1)`,
    ].join("; "),
  );
}
async function setSignups(value) {
  const r = await fetch(`${BASE}/api/v1/admin/flags/SIGNUPS`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value, why: `signups-check: ${value}` }),
  });
  const body = await r.json().catch(() => null);
  assert(r.status === 200 && body?.flag?.value === value, `SIGNUPS ${value} over REST: ${r.status} ${JSON.stringify(body)}`);
}

// ---------- the stand-in providers ----------
const STANDIN = `http://localhost:${STANDIN_PORT}`;
const standin = spawn(process.execPath, [join(APP, "scripts/auth-standin.mjs"), String(STANDIN_PORT), BASE], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok, fail) => {
  standin.stdout.once("data", ok);
  standin.once("exit", (code) => fail(new Error(`the stand-in exited (${code}): is port ${STANDIN_PORT} free?`)));
});
const control = (answers) => fetch(`${STANDIN}/control`, { method: "POST", body: JSON.stringify(answers) }).then((r) => r.json());
const person = (name) => ({ sub: `g-${name}-${RUN}`, name: `Person ${name}` });

// ---------- Chrome ----------
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
let context, page, authenticator, cdp;
async function phone({ dark = false, width = 390 } = {}) {
  await context?.close();
  context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" });
  page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !expected?.test(m.text()) && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  ({ authenticatorId: authenticator } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  }));
}
const credentials = async () => (await cdp.send("WebAuthn.getCredentials", { authenticatorId: authenticator })).credentials;
const appReady = async () => {
  await page.waitForURL((url) => url.pathname === "/app/", { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
};
const me = async () => {
  const r = await context.request.get(`${BASE}/api/me`);
  return r.status() === 200 ? r.json() : null;
};
const signOut = async () => {
  await page.goto("about:blank");
  await context.request.post(`${BASE}/api/auth/logout`, { data: {} });
};
const way = (provider) => page.locator(`[data-part="sign-in-button"][data-variant="${provider}"]`);
async function passkeySignUp(name) {
  await page.goto(`${BASE}/login`);
  await page.click("#new summary");
  await page.fill('#register input[name="name"]', name);
  await page.click('#register button[type="submit"]');
}
/** What the sign-in page shows while paused: the words where the form was, signing in as ever. */
async function pausedPage(label) {
  const notice = page.locator("#signups-paused");
  assert(await notice.isVisible(), `${label}: no paused words`);
  const text = (await notice.textContent()).replace(/\s+/g, " ").trim();
  assert(text.includes(WORDS) && text.includes(HAVE), `${label}: the words: ${text}`);
  assert((await page.locator("#register, #new, #create").count()) === 0, `${label}: a create form is still there`);
  assert(await page.locator("#signin").isVisible(), `${label}: no passkey sign-in`);
  // Signing in right under the words, as the newcomer's page has its ways right under the headline (signin-check's 48 px), never at the foot.
  const gap = await page.evaluate(() => document.querySelector(".lx-signin-ways").getBoundingClientRect().top - document.querySelector("#signups-paused").getBoundingClientRect().bottom);
  assert(gap <= 48, `${label}: ${Math.round(gap)} px between the words and Sign in`);
  const heading = (await page.locator(".lx-signin-ways-title").textContent()).trim();
  assert(heading === "Sign in", `${label}: the heading offers to create an account: ${heading}`);
  assert(await way("google").isVisible(), `${label}: no Google`);
  const cut = await page.evaluate(() => [...document.querySelectorAll("#signups-paused *")].some((el) => el.scrollWidth > el.clientWidth + 1));
  assert(!cut, `${label}: the words cut off`);
}

let first = null; // the account the stages after the first sign in to
const firstGoogle = person("ada");

await stage("open: a passkey sign-up and a Google sign-up go through (the accounts later stages sign in to)", async () => {
  await setSignups("open");
  await phone();
  await passkeySignUp("Pat Passkey");
  await appReady();
  first = (await me())?.user?.id;
  assert(first, "no account after the passkey sign-up");
  assert((await credentials()).length === 1, "no passkey on the device");
  await signOut();
  await page.goto(`${BASE}/login`);
  await control({ google: firstGoogle });
  await way("google").click();
  await page.waitForURL(`${BASE}/login/new`);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await appReady();
  await signOut();
  return `accounts made: ${(await counts()).users - 1} (and the admin)`;
});

await stage("paused: the sign-in page and Start learning's say so in place of the create form, light and dark, 390 and 320", async () => {
  await setSignups("paused");
  const seen = [];
  for (const [dark, width] of [[false, 390], [true, 390], [false, 320], [true, 320]]) {
    await phone({ dark, width });
    for (const path of ["/login", "/login?new=1"]) {
      await page.goto(`${BASE}${path}`);
      await pausedPage(`${path} ${dark ? "dark" : "light"} ${width}`);
      if (path === "/login?new=1") assert((await page.getByRole("heading", { name: "Create your account" }).count()) === 0, "?new=1 still offers to create one");
      await page.screenshot({ path: join(OUT, "shots", `paused-${path === "/login" ? "login" : "new"}-${dark ? "dark" : "light"}-${width}.png`), fullPage: true });
      seen.push(`${path} ${dark ? "dark" : "light"} ${width}`);
    }
  }
  return seen.length + " pages";
});

await stage("paused: a passkey sign-up's first step answers 503 in words (signups_paused, Retry-After), nothing counted or written", async () => {
  const before = counts();
  const r = await fetch(`${BASE}/api/auth/register/options`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ name: "Someone new" }) });
  const body = await r.json();
  assert(r.status === 503 && body.code === "signups_paused" && body.error === WORDS && r.headers.get("retry-after") === "300", `${r.status} ${JSON.stringify(body)} Retry-After ${r.headers.get("retry-after")}`);
  assert(r.headers.get("set-cookie") === null, "a cookie set");
  assert(same(counts(), before), `written: ${JSON.stringify(before)} → ${JSON.stringify(counts())}`);
});

await stage("paused: a page loaded before the pause shows the words when pressed, and the device is asked for no passkey", async () => {
  await setSignups("open");
  await phone();
  await page.goto(`${BASE}/login`);
  await page.click("#new summary");
  await page.fill('#register input[name="name"]', "Late Larry");
  await setSignups("paused");
  const before = counts();
  expected = /Failed to load resource: the server responded with a status of 503/;
  await page.click('#register button[type="submit"]');
  const error = page.locator("#auth-error");
  await error.waitFor({ state: "visible", timeout: 10_000 });
  expected = null;
  assert((await error.textContent()).includes(WORDS), `the error line: ${await error.textContent()}`);
  assert((await credentials()).length === 0, "the device made a passkey");
  assert(same(counts(), before), "written");
});

await stage("paused: a passkey sign-up whose options came before the pause finishes (its passkey is already on the device)", async () => {
  await setSignups("open");
  await phone();
  const before = counts();
  // The pause comes between the sign-up's two steps: after its options, while its verify is on its way.
  await page.route("**/api/auth/register/verify", async (route) => {
    await setSignups("paused");
    await route.continue();
  });
  await passkeySignUp("Between Bea");
  await appReady();
  await page.unroute("**/api/auth/register/verify");
  const after = counts();
  assert(after.users === before.users + 1 && after.passkeys === before.passkeys + 1, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  await signOut();
});

await stage("paused: a new Google sign-in gets the words with nothing written; a linked Google account signs in", async () => {
  await phone();
  await page.goto(`${BASE}/login`);
  const before = counts();
  await control({ google: person("newcomer") });
  await way("google").click();
  await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("error") === "paused");
  await pausedPage("after Google");
  assert((await page.locator('[data-part="feedback"][data-meaning="wrong"]:not([hidden])').count()) === 0, "a red error beside the words");
  assert(same(counts(), before), `written: ${JSON.stringify(before)} → ${JSON.stringify(counts())}`);
  await control({ google: firstGoogle });
  await way("google").click();
  await appReady();
  assert((await me())?.user, "the linked account isn't signed in");
  await signOut();
});

await stage("paused: an existing account's passkey signs in, and its session answers", async () => {
  // An account made on this device while open (its passkey on the virtual authenticator), signing in with it while paused.
  await phone();
  await setSignups("open");
  await passkeySignUp("Device Dee");
  await appReady();
  const dee = (await me()).user.id;
  await signOut();
  await setSignups("paused");
  await page.goto(`${BASE}/login`);
  await page.click("#signin");
  await appReady();
  const who = await me();
  assert(who?.user?.id === dee, `signed in as ${who?.user?.id}`);
  const r = await context.request.get(`${BASE}/api/look?since=0&lib=0`);
  assert(r.status() === 200 || r.status() === 204, `a signed-in route: ${r.status()}`);
  await signOut();
});

await stage("paused: a create step reached before the pause says so, writes nothing, and finishes once open again", async () => {
  await setSignups("open");
  await phone();
  await page.goto(`${BASE}/login`);
  const lateGoogle = person("late");
  await control({ google: lateGoogle });
  await way("google").click();
  await page.waitForURL(`${BASE}/login/new`);
  await setSignups("paused");
  const before = counts();
  // The form as the page had it, sent while paused: the create step again with the words.
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/login/new" && url.searchParams.get("error") === "paused");
  assert(await page.locator("#signups-paused").isVisible(), "no words on the create step");
  assert((await page.locator("#create").count()) === 0, "the create form is still there");
  assert(same(counts(), before), `written: ${JSON.stringify(before)} → ${JSON.stringify(counts())}`);
  await page.screenshot({ path: join(OUT, "shots", "paused-create-step.png"), fullPage: true });
  await setSignups("open");
  await page.goto(`${BASE}/login/new`);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await appReady();
  assert(counts().users === before.users + 1, "not made once open again");
  await signOut();
});

await stage("open again: a passkey sign-up goes through", async () => {
  await setSignups("open");
  await phone();
  await passkeySignUp("Open Olive");
  await appReady();
  await signOut();
});

if (SERVER_LOG) {
  await stage("the watch's lines in the server's log: every account made and every sign-up turned away, once each", async () => {
    await sleep(1000);
    const log = readFileSync(SERVER_LOG, "utf8");
    const made = (log.match(/lx-watch signup\b/g) ?? []).length;
    const away = (log.match(/lx-watch signups_paused\b/g) ?? []).length;
    // Made: Pat, Ada (Google), Bea (between), Dee, the late create step, Olive. Turned away: the API's 503, the page loaded before, the new
    // Google sign-in, the create step's post.
    assert(made === 6 && away === 4, `signup ${made} (6), signups_paused ${away} (4)`);
    return `signup ${made}, signups_paused ${away}`;
  });
}

await stage("no console errors, no stray null", async () => {
  assert(!problems.length, problems.slice(0, 5).join(" | "));
});

await setSignups("open").catch(() => {});
await browser.close();
standin.kill();
writeFileSync(join(OUT, "signups-check.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `signups check: ${failed} FAILED of ${results.length}` : `signups check: all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
