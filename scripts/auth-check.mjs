// Checks signing in end to end in headless Chrome on a LOCAL server, with stand-ins for Google, GitHub and Apple
// (scripts/auth-standin.mjs, started here) and a virtual passkey: the sign-in page (phone and desktop, on a dark phone and a
// light one: the site's pages follow the phone, never the app's saved look),
// signing up with Google and with GitHub through the create step, adding and removing ways in Settings, signing back in
// to the same account each way, the create step's "sign in to add it to your account" (by passkey, and by a provider
// that's known and one that isn't), a sign-in already on another account, canceled, tampered, replayed and forged
// round trips, posts from another site, an AI app connecting through Google sign-in to a working /mcp call ("Not
// you?" included), the export, and deleting the account. It creates and deletes accounts: LOCAL only. Fails on any
// console error. With --apple-key <file> (a test key: node scripts/auth-standin.mjs apple-key <file>) the server must offer
// Apple too, on its stand-in, and Apple's stages run: its button in Apple's colors, a sign-up through the create step (Apple
// gives no name), signing back in, a cancel, and every tampered answer refused, the client secret's signature among them;
// without it the server must offer no Apple.
//
// Local server (its own state; the stand-in's port and clients must match):
//   npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>
//   npx wrangler dev --port <port> --local-upstream localhost:<port> --persist-to <dir> --var GATE_ENABLED:false \
//     --var PUBLIC_ORIGIN:http://localhost:<port> --var RP_ID:localhost --var UPLOAD_SIGNING_SECRET:<any> \
//     --var AUTH_STANDIN:http://localhost:<standin port> \
//     --var GOOGLE_SIGNIN_CLIENT_ID:standin-google-client --var GOOGLE_SIGNIN_CLIENT_SECRET:standin-google-secret \
//     --var GITHUB_CLIENT_ID:standin-github-client --var GITHUB_CLIENT_SECRET:standin-github-secret
//   and for Apple: --var APPLE_SERVICES_ID:standin.apple.services --var APPLE_TEAM_ID:STANDINTEAM --var APPLE_KEY_ID:STANDINKEY1 \
//     --var APPLE_PRIVATE_KEY:"$(grep -v -- ----- <file> | tr -d '\n')"
// Usage (headless Chrome, so through gpu.py's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "auth check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/auth-check.mjs http://localhost:<port> <outDir> [--standin-port 8828] [--apple-key <file>]

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const args = process.argv.slice(2);
const [BASE, OUT = "auth-check-out"] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const portAt = args.indexOf("--standin-port");
const STANDIN_PORT = portAt === -1 ? 8828 : Number(args[portAt + 1]);
if (!Number.isInteger(STANDIN_PORT) || STANDIN_PORT < 1 || STANDIN_PORT > 65535) {
  console.error(`--standin-port: not a port (${args[portAt + 1]})`);
  process.exit(2);
}
if (!BASE || !/^http:\/\/localhost:\d+$/.test(BASE)) {
  console.error("auth-check creates and deletes accounts: give it a local server, e.g. http://localhost:8827");
  process.exit(2);
}
const STANDIN = `http://localhost:${STANDIN_PORT}`;
const appleAt = args.indexOf("--apple-key");
const APPLE_KEY = appleAt === -1 ? null : args[appleAt + 1];
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// ---------- the stand-in providers ----------

const standin = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "auth-standin.mjs"), String(STANDIN_PORT), BASE, ...(APPLE_KEY ? [APPLE_KEY] : [])], {
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  standin.stdout.once("data", resolve);
  standin.once("exit", (code) => reject(new Error(`the stand-in exited (${code}): is port ${STANDIN_PORT} free?`)));
});
const control = (answers) => fetch(`${STANDIN}/control`, { method: "POST", body: JSON.stringify(answers) }).then((r) => r.json());
const standinLog = () => fetch(`${STANDIN}/log`).then((r) => r.json());

// Ids unique to this run, so the check runs again on the same local state; every account it makes is deleted.
const RUN = Date.now().toString(36);
const sub = (name) => `g-${name}-${RUN}`;
let ghIds = Date.now() % 1_000_000_000;
const ghId = () => ++ghIds;
const ADA = { sub: sub("ada"), name: "Ada Lovelace" };
const ADA_GH = { id: ghId(), login: "ada-l", name: "Ada" };

// ---------- Chrome ----------

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
// The AI app's loopback redirect has nothing listening: that one failed load is expected.
const LOOPBACK = "http://127.0.0.1:53682/callback";
page.on("console", (m) => m.type() === "error" && !m.text().includes("127.0.0.1:53682") && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const strayText = [];
const shot = async (name) => {
  const found = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/^\s*(null|undefined)\s*$/.test(node.textContent)) hits.push(node.parentElement?.tagName);
    return hits;
  });
  for (const where of found) strayText.push(`${name}: in ${where}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`), fullPage: true });
};

// The API from the browser's own cookies, without loading anything into the page (a 401 there would log an error).
const me = async () => {
  const response = await context.request.get(`${BASE}/api/me`);
  return response.status() === 200 ? response.json() : null;
};
const signOut = async () => {
  await page.goto("about:blank");
  await context.request.post(`${BASE}/api/auth/logout`, { data: {} });
  await page.goto(`${BASE}/login`);
};
const deleteThisAccount = async () => {
  await page.goto("about:blank");
  const response = await context.request.delete(`${BASE}/api/me`, { data: { confirm: "delete my account" } });
  assert(response.status() === 200, `delete: ${response.status()}`);
};
const way = (provider) => page.locator(`[data-part="sign-in-button"][data-variant="${provider}"]`);
const appReady = async () => {
  await page.waitForURL((url) => url.pathname === "/app/", { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 20_000 });
};
const openAccount = async () => {
  await page.evaluate(() => (location.hash = "#settings/account"));
  await page.locator('section.lx-ways[aria-label="Ways to sign in"]').waitFor();
};
const noteText = () => page.locator('section.lx-ways [data-part="group-note"]').textContent();
const settingsMessage = () => page.locator(".lx-settings-message").textContent();

let account1 = null;

// ---------- the sign-in page ----------

await stage("the sign-in page on a dark phone: three ways, the same size; Google's own colors and font (dark)", async () => {
  // The site's pages follow the phone (data-site-look; theme-boot.js skips the saved look there): a dark phone, a dark page.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/login`);
  const buttons = await page.locator('[data-part="sign-in-button"]').evaluateAll((nodes) => nodes.map((n) => ({ way: n.dataset.variant, h: n.getBoundingClientRect().height, w: n.getBoundingClientRect().width })));
  const expected = APPLE_KEY ? "google,github,apple,passkey" : "google,github,passkey";
  assert(buttons.map((b) => b.way).join() === expected, `ways: ${buttons.map((b) => b.way)} (expected ${expected})`);
  assert(new Set(buttons.map((b) => `${b.w}x${b.h}`)).size === 1, `sizes differ: ${JSON.stringify(buttons)}`);
  const google = await way("google").evaluate((n) => ({ bg: getComputedStyle(n).backgroundColor, border: getComputedStyle(n).borderColor, font: getComputedStyle(n).fontFamily, g: n.querySelector("img").naturalWidth }));
  assert(google.bg === "rgb(19, 19, 20)" && google.border === "rgb(142, 145, 143)", `dark Google: ${JSON.stringify(google)}`);
  assert(google.font.includes("Google Sans") && google.g === 80, `Google's font and G: ${JSON.stringify(google)}`);
  assert(await page.evaluate(() => document.fonts.check('500 14px "Google Sans"')), "Google Sans loaded");
  assert((await page.locator("summary").count()) === 1, "one summary (the other checks open it to sign up)");
  await shot("01-login-phone-dark");
  return `${buttons.length} ways, ${buttons[0].w}×${buttons[0].h}`;
});

await stage("the sign-in page on a light phone (the app's own light look on a dark phone changing nothing), and on a wide screen", async () => {
  const google = () => way("google").evaluate((n) => [getComputedStyle(n).backgroundColor, getComputedStyle(n).borderColor]);
  // The control: the app's Paper saved on this device, the phone still dark: the page and Google's button stay dark.
  await page.evaluate(() => localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme: "paper" })));
  await page.reload();
  const kept = await google();
  assert(kept[0] === "rgb(19, 19, 20)" && kept[1] === "rgb(142, 145, 143)", `the app's Paper on a dark phone: Google ${kept}`);
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  const bg = await google();
  assert(bg[0] === "rgb(255, 255, 255)" && bg[1] === "rgb(116, 119, 117)", `light Google: ${bg}`);
  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await shot("02-login-phone-light");
  await page.evaluate(() => localStorage.removeItem("lx.appearance.v1"));
  // The stages after this run as they always have, on the browser's own scheme.
  await page.emulateMedia({ colorScheme: null });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.reload();
  await shot("03-login-desktop");
  await page.locator("summary").click();
  await shot("03b-login-desktop-new-open");
  await page.setViewportSize({ width: 390, height: 844 });
  return `a light phone: Google's light button on ${canvas}; the app's Paper on a dark phone: still dark`;
});

// ---------- signing up with Google ----------

await stage("Google sign-up: the create step (name from Google), then the app", async () => {
  await page.goto(`${BASE}/login`);
  await control({ google: ADA });
  await way("google").click();
  await page.waitForURL(`${BASE}/login/new`);
  assert((await page.locator('input[name="name"]').inputValue()) === "Ada Lovelace", "name filled in from Google");
  assert(await page.getByText("No Lexicommons account uses this yet").isVisible(), "says nobody uses it");
  await shot("04-create-step");
  await page.fill('input[name="name"]', "Ada");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await appReady();
  const who = await me();
  // Kept first: the stages after this one sign in to this account, and shouldn't all fail with it.
  account1 = who.user.id;
  assert(who.user.name === "Ada" && who.signins.length === 1 && who.signins[0].provider === "google" && who.signins[0].subject === ADA.sub, JSON.stringify(who));
  assert(who.passkeys.length === 0, "no passkey yet");
  // No email from the sign-in: the account's own email (src/account-email.ts) is only one added by its code in Settings, so none yet; nothing else
  // in /api/me names one.
  const { email: ownEmail, ...rest } = who;
  assert(!ownEmail?.email && !ownEmail?.verifiedAt && !/email/i.test(JSON.stringify(rest)), `no email anywhere: ${JSON.stringify(who)}`);
  const log = await standinLog();
  assert(log.every((entry) => entry.problems.length === 0), `the stand-in saw problems: ${JSON.stringify(log.filter((e) => e.problems.length))}`);
  return `account ${account1.slice(0, 6)}…; Google ${who.signins[0].label}`;
});

await stage("Settings → Account: one way to sign in, so it asks for another, and it can't be removed", async () => {
  await openAccount();
  assert((await noteText()).startsWith("This is your only way to sign in"), `note: ${await noteText()}`);
  assert((await page.getByRole("button", { name: /^Remove/ }).count()) === 0, "no Remove on the only way");
  assert(await page.getByRole("button", { name: "Add GitHub" }).isVisible(), "Add GitHub offered");
  assert((await page.getByRole("button", { name: "Add Google" }).count()) === 0, "Google is already there");
  await shot("05-account-one-way");
  const refused = await context.request.delete(`${BASE}/api/auth/ways/google/${ADA.sub}`, { data: {} });
  assert(refused.status() === 400, `removing the last way: ${refused.status()}`);
  return "nudge shown; last way kept";
});

await stage("Settings: add GitHub (round trip), then a passkey", async () => {
  await control({ github: ADA_GH });
  await page.getByRole("button", { name: "Add GitHub" }).click();
  await appReady();
  await page.locator('section.lx-ways[aria-label="Ways to sign in"]').waitFor();
  assert((await settingsMessage()).includes("GitHub added"), `message: ${await settingsMessage()}`);
  assert(!page.url().includes("signin="), "the result is said once, then dropped from the address");
  await page.getByRole("button", { name: "Add a passkey on this device" }).click();
  await page.locator(".lx-settings-message", { hasText: "Passkey added" }).waitFor();
  const who = await me();
  assert(who.user.id === account1 && who.signins.length === 2 && who.passkeys.length === 1, JSON.stringify(who));
  assert(who.signins.find((s) => s.provider === "github")?.label === "@ada-l", "GitHub's label is its @username");
  assert(!(await noteText()).startsWith("This is your only way"), "no nudge with three ways");
  assert((await page.getByRole("button", { name: /^Remove/ }).count()) === 3, "each of three ways can be removed");
  const waysShown = await page.locator('section.lx-ways .lx-row-title').allTextContents();
  assert(waysShown.some((t) => /passkey/i.test(t) && !t.startsWith("Add")) && waysShown.includes("Google") && waysShown.includes("GitHub"), `the ways listed: ${waysShown.join(", ")}`);
  await shot("06-account-three-ways");
  return "Google, GitHub and a passkey on one account";
});

// ---------- signing back in, each way ----------

await stage("sign out (notice), then Google signs in to the same account, no create step", async () => {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login\?signedout=1/);
  assert(await page.getByText("You've signed out.").isVisible(), "signed-out notice");
  await shot("07-signed-out");
  await control({ google: ADA });
  await way("google").click();
  await appReady();
  assert((await me()).user.id === account1, "same account");
  return "Google → the same account";
});

await stage("GitHub, then a passkey, sign in to the same account", async () => {
  await signOut();
  await control({ github: ADA_GH });
  await way("github").click();
  await appReady();
  assert((await me()).user.id === account1, "GitHub: same account");
  await signOut();
  await page.locator("#signin").click();
  await appReady();
  assert((await me()).user.id === account1, "passkey: same account");
  return "both";
});

await stage("signed in already: /login goes straight on to next", async () => {
  await page.goto(`${BASE}/login?next=${encodeURIComponent("/app/#settings")}`);
  await page.waitForURL(`${BASE}/app/#settings`);
  return "→ /app/#settings";
});

// ---------- what goes wrong ----------

await stage("canceled at Google, and at GitHub: said plainly, still signed out", async () => {
  await signOut();
  await control({ google: { cancel: true } });
  await way("google").click();
  await page.waitForURL(/\/login\?error=cancelled&with=google/);
  assert(await page.getByText("You canceled signing in with Google.").isVisible(), "Google's cancel said");
  await shot("08-canceled");
  await control({ github: { cancel: true } });
  await way("github").click();
  await page.waitForURL(/\/login\?error=cancelled&with=github/);
  assert(await page.getByText("You canceled signing in with GitHub.").isVisible(), "GitHub's cancel said");
  assert((await me()) === null, "still signed out");
  return "both";
});

await stage("a tampered answer is refused: Google's nonce, audience, issuer, expiry; GitHub's code", async () => {
  for (const tamper of ["nonce", "aud", "iss", "expired"]) {
    await page.goto(`${BASE}/login`);
    await control({ google: { ...ADA, tamper } });
    await way("google").click();
    await page.waitForURL(/\/login\?error=provider&with=google/);
    assert((await me()) === null, `${tamper}: signed in anyway`);
  }
  assert(await page.getByText("Google didn't answer as expected.", { exact: false }).isVisible(), "the words");
  await shot("09-provider-error");
  await control({ github: { ...ADA_GH, tamper: "bad-code" } });
  await way("github").click();
  await page.waitForURL(/\/login\?error=provider&with=github/);
  assert((await me()) === null, "bad code: signed in anyway");
  return "5 refused";
});

/** Starts a round trip from this browser's cookies and returns the callback URL the provider sends back. */
async function callbackUrl(provider, answer, request = context.request) {
  await control({ [provider]: answer });
  const start = await request.post(`${BASE}/login/${provider}`, { form: { next: "/app/", intent: "signin" }, headers: { Origin: BASE }, maxRedirects: 0 });
  assert(start.status() === 303, `start: ${start.status()}`);
  const back = await request.get(start.headers().location, { maxRedirects: 0 });
  assert(back.status() === 302, `stand-in: ${back.status()}`);
  return back.headers().location;
}

await stage("a replayed callback, a forged state, and a callback in another browser are refused", async () => {
  await signOut();
  const url = await callbackUrl("google", ADA);
  const first = await context.request.get(url, { maxRedirects: 0 });
  assert(first.status() === 303 && first.headers().location === "/app/", `first: ${first.status()} ${first.headers().location}`);
  await context.request.post(`${BASE}/api/auth/logout`, { data: {} });
  const again = await context.request.get(url, { maxRedirects: 0 });
  assert(again.status() === 303 && again.headers().location.includes("error=expired"), `replay: ${again.headers().location}`);
  const forged = new URL(await callbackUrl("google", ADA));
  forged.searchParams.set("state", "x".repeat(32));
  const bad = await context.request.get(forged.toString(), { maxRedirects: 0 });
  assert(bad.headers().location.includes("error=expired"), `forged state: ${bad.headers().location}`);
  const other = await browser.newContext();
  const elsewhere = await other.request.get(await callbackUrl("google", ADA), { maxRedirects: 0 });
  assert(elsewhere.headers().location.includes("error=expired"), `another browser: ${elsewhere.headers().location}`);
  await other.close();
  assert((await me()) === null, "still signed out");
  return "3 refused";
});

await stage("posts from another site are refused (start, create, attach, sign out)", async () => {
  const statuses = [];
  for (const [path, form] of [["/login/google", { next: "/app/", intent: "signin" }], ["/login/new", { name: "X" }], ["/login/attach", {}], ["/logout", { next: "/app/" }]]) {
    for (const origin of ["http://evil.example", null]) {
      const response = await context.request.post(`${BASE}${path}`, { form, headers: origin ? { Origin: origin } : {}, maxRedirects: 0 });
      statuses.push(response.status());
      assert(response.status() === 403, `${path} from ${origin ?? "nowhere"}: ${response.status()}`);
    }
  }
  return statuses.join(" ");
});

await stage("a GitHub sign-up; a Google already on another account can't be added to it", async () => {
  await signOut();
  const bobId = ghId();
  await control({ github: { id: bobId, login: "bob-b", name: null } });
  await way("github").click();
  await page.waitForURL(`${BASE}/login/new`);
  assert((await page.locator('input[name="name"]').inputValue()) === "bob-b", "no GitHub name: the username");
  await page.fill('input[name="name"]', "Bob");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await appReady();
  const bob = await me();
  assert(bob.user.id !== account1 && bob.signins.length === 1, JSON.stringify(bob));
  await openAccount();
  await control({ google: ADA });
  await page.getByRole("button", { name: "Add Google" }).click();
  await appReady();
  await page.locator('section.lx-ways[aria-label="Ways to sign in"]').waitFor();
  assert((await settingsMessage()).includes("signs in to another Lexicommons account"), `message: ${await settingsMessage()}`);
  assert((await me()).signins.length === 1, "not added");
  await shot("10-taken");
  const refused = await context.request.delete(`${BASE}/api/auth/ways/github/${bobId}`, { data: {} });
  assert(refused.status() === 400, `removing Bob's only way: ${refused.status()}`);
  await deleteThisAccount();
  return "refused, with the reason";
});

await stage("the create step: sign in with a passkey, and the new Google joins that account", async () => {
  await signOut();
  await control({ google: { sub: sub("cara"), name: "Cara" } });
  await way("google").click();
  await page.waitForURL(`${BASE}/login/new`);
  await shot("11-create-step-have-account");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await appReady();
  const who = await me();
  assert(who.user.id === account1 && who.signins.some((s) => s.subject === sub("cara")), JSON.stringify(who.signins));
  return "added to the passkey's account";
});

await stage("the create step: a second new sign-in waits beside the first, then one account has both", async () => {
  await signOut();
  await control({ github: { id: ghId(), login: "dee-d", name: "Dee" } });
  await way("github").click();
  await page.waitForURL(`${BASE}/login/new`);
  await control({ google: { sub: sub("dee"), name: "Dee D" } });
  await way("google").click();
  await page.waitForURL(/\/login\/new\?error=unknown&with=google/);
  assert(await page.getByText("No account uses that Google either.", { exact: false }).isVisible(), "says so");
  assert((await page.locator(".lx-signin-pending li").count()) === 2, "both wait");
  await shot("12-create-step-two");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await appReady();
  const who = await me();
  assert(who.user.name === "Dee" && who.signins.length === 2, JSON.stringify(who));
  await deleteThisAccount();
  return "one account, GitHub and Google";
});

await stage("the create step: a known Google signs in, and the new GitHub joins that account", async () => {
  await signOut();
  const workId = ghId();
  await control({ github: { id: workId, login: "ada-work", name: "Ada" } });
  await way("github").click();
  await page.waitForURL(`${BASE}/login/new`);
  await control({ google: ADA });
  await way("google").click();
  await appReady();
  const who = await me();
  assert(who.user.id === account1 && who.signins.some((s) => s.subject === String(workId)), JSON.stringify(who.signins));
  return "added to Ada's account";
});

await stage("removing a way in Settings (asks first)", async () => {
  await openAccount();
  const before = (await me()).signins.length;
  const remove = page.getByRole("button", { name: "Remove GitHub" }).first();
  await remove.click();
  await page.getByRole("button", { name: "Press again to remove GitHub" }).click();
  await page.locator(".lx-settings-message", { hasText: "GitHub removed" }).waitFor();
  assert((await me()).signins.length === before - 1, "one fewer");
  return `${before} → ${before - 1}`;
});

// ---------- an AI app connecting through Google sign-in ----------

await stage("an AI app connects through Google sign-in: its name on sign-in, consent, \"Not you?\", then /mcp works", async () => {
  await signOut();
  const registered = await (
    await fetch(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Auth check", redirect_uris: [LOOPBACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    })
  ).json();
  assert(registered.client_id, `register: ${JSON.stringify(registered)}`);
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(`${BASE}/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: registered.client_id,
    redirect_uri: LOOPBACK,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "auth-check-state",
    scope: "learn:read learn:write",
    resource: `${BASE}/mcp`,
  }))
    authorize.searchParams.set(k, v);
  await page.goto(authorize.toString());
  await page.waitForURL(/\/login\?next=%2Fauthorize/);
  assert(await page.getByRole("heading", { name: "Sign in to connect Auth check" }).isVisible(), "the app's name on sign-in");
  await shot("13-login-connect");
  await control({ google: ADA });
  await way("google").click();
  await page.getByRole("heading", { name: "Connect Auth check?" }).waitFor();
  assert(await page.getByText("This app named itself", { exact: false }).isVisible(), "unverified said");
  await shot("14-consent");
  await page.getByRole("button", { name: "Not you?" }).click();
  await page.waitForURL(/\/login\?signedout=1&next=%2Fauthorize/);
  assert(await page.getByRole("heading", { name: "Sign in to connect Auth check" }).isVisible(), "back to sign-in, still connecting");
  await control({ google: ADA });
  await way("google").click();
  await page.getByRole("heading", { name: "Connect Auth check?" }).waitFor();
  const redirected = page.waitForRequest((request) => request.url().startsWith(LOOPBACK));
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const back = new URL((await redirected).url());
  assert(back.searchParams.get("state") === "auth-check-state" && back.searchParams.get("code"), `redirect: ${back}`);
  const tokens = await (
    await fetch(`${BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code"), redirect_uri: LOOPBACK, client_id: registered.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }),
    })
  ).json();
  assert(tokens.access_token, `token: ${JSON.stringify(tokens)}`);
  const call = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }),
  });
  const text = await call.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  const who = JSON.parse(JSON.parse(line.slice(6)).result.content[0].text);
  assert(who.userId === account1 && who.via === "oauth", `whoami: ${JSON.stringify(who)}`);
  await page.goto(`${BASE}/app/`);
  await appReady();
  // Connected by a real sign-in, with no token at all: the app knows, and Home has the way to it. Read keeps the third tab until the setting gives it to AI: then the tab's there. Let go, both go.
  const state = () => page.evaluate(async () => ({ me: (await (await fetch("/api/me")).json()).aiConnected, tokens: (await (await fetch("/api/tokens")).json()).length }));
  const tab = (on) => page.waitForFunction((want) => [...document.querySelectorAll('[data-part="tab-bar"] [data-part="tab"]')].some((t) => t.textContent.trim() === "AI") === want, on, { timeout: 8000 });
  const yourAi = (on) => page.waitForFunction((want) => Boolean(document.querySelector('[data-part="page"] [data-part="home-card"][data-variant="ai"]')) === want, on, { timeout: 8000 });
  const connected = await state();
  assert(connected.me === true && connected.tokens === 0, `an app connected by sign-in: ${JSON.stringify(connected)}`);
  await yourAi(true);
  await shot("15-connected-by-sign-in");
  await page.evaluate(() => localStorage.setItem("lx.shell.v1", JSON.stringify({ third: "ai" })));
  await page.reload();
  await appReady();
  await tab(true);
  await page.goto(`${BASE}/app/#ai/connect`);
  await page.getByRole("button", { name: "Disconnect" }).first().click();
  await tab(false);
  const letGo = await state();
  assert(letGo.me === false, `disconnected: ${JSON.stringify(letGo)}`);
  await page.goto(`${BASE}/app/#today`);
  await yourAi(false);
  return `whoami: ${who.name} via ${who.app}; the access token lasts ${tokens.expires_in} s; Your AI on Home and the AI tab came with the sign-in, and went on Disconnect`;
});

// ---------- export and delete ----------

await stage("the export lists the sign-ins (no email); deleting the account removes them", async () => {
  const exported = await (await context.request.get(`${BASE}/api/me/export`)).json();
  assert(exported.signins?.length >= 2, `export: ${JSON.stringify(exported.signins)}`);
  assert(exported.signins.every((s) => Object.keys(s).join() === "provider,subject,label,createdAt,lastUsedAt"), "only these fields");
  await deleteThisAccount();
  await page.goto(`${BASE}/login?deleted=1`);
  assert(await page.getByText("Your account has been deleted.").isVisible(), "deleted notice");
  await shot("15-deleted");
  await control({ google: ADA });
  await way("google").click();
  await page.waitForURL(`${BASE}/login/new`);
  return `${exported.signins.length} sign-ins exported; Google is free again`;
});

// ---------- Apple (with --apple-key) ----------

const APPLE_SUB = `001234.${randomBytes(16).toString("hex")}.0${RUN.slice(-3)}`;
if (APPLE_KEY) {
  await stage("Apple's button drawn like GitHub's (the others' surface, its logo in the ink), dark and light, the others' size", async () => {
    await signOut();
    const look = (provider) =>
      way(provider).evaluate((n) => {
        const css = getComputedStyle(n);
        return { bg: css.backgroundColor, ink: css.color, border: `${css.borderTopWidth} ${css.borderTopColor}`, h: n.getBoundingClientRect().height, w: n.getBoundingClientRect().width };
      });
    for (const theme of ["graphite", "paper"]) {
      if (theme === "paper") {
        await page.evaluate(() => localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme: "paper" })));
        await page.reload();
      }
      const [apple, github] = [await look("apple"), await look("github")];
      assert(JSON.stringify(apple) === JSON.stringify(github), `${theme}: Apple ${JSON.stringify(apple)}, GitHub ${JSON.stringify(github)}`);
      assert(await way("apple").evaluate((n) => Boolean(n.querySelector("svg path")) && getComputedStyle(n.querySelector("svg")).color === getComputedStyle(n).color), `${theme}: Apple's logo in the ink`);
      await shot(theme === "paper" ? "21-apple-login-light" : "20-apple-login-dark");
    }
    assert((await way("apple").innerText()).trim() === "Continue with Apple", await way("apple").innerText());
    await page.evaluate(() => localStorage.removeItem("lx.appearance.v1"));
    await page.reload();
    return "like GitHub's in both";
  });

  let appleAccount = null;
  await stage("Apple sign-up: the create step with no name from Apple, then the app; the client secret signed and checked", async () => {
    await control({ apple: { sub: APPLE_SUB } });
    await way("apple").click();
    await page.waitForURL(`${BASE}/login/new`);
    assert((await page.locator('input[name="name"]').inputValue()) === "", "Apple gives no name: the field is empty");
    await shot("22-apple-create-step");
    await page.fill('input[name="name"]', "Grace");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await appReady();
    const who = await me();
    appleAccount = who.user.id;
    assert(who.signins.length === 1 && who.signins[0].provider === "apple" && who.signins[0].subject === APPLE_SUB && who.signins[0].label === null, JSON.stringify(who.signins));
    const { email: ownEmail, ...rest } = who;
    assert(!ownEmail?.email && !/email/i.test(JSON.stringify(rest)), "no email anywhere");
    const apple = (await standinLog()).filter((e) => e.provider === "apple");
    assert(apple.length >= 2 && apple.every((e) => e.problems.length === 0), `the stand-in saw problems: ${JSON.stringify(apple)}`);
    return `account ${appleAccount.slice(0, 6)}…`;
  });

  await stage("Apple signs back in to the same account; Settings lists it", async () => {
    await signOut();
    await control({ apple: { sub: APPLE_SUB } });
    await way("apple").click();
    await appReady();
    assert((await me()).user.id === appleAccount, "the same account");
    await openAccount();
    const waysShown = await page.locator('section.lx-ways .lx-row-title').allTextContents();
    assert(waysShown.includes("Apple") && waysShown.includes("Add Google") && waysShown.includes("Add GitHub"), `the ways: ${waysShown.join(", ")}`);
    await shot("23-apple-account");
    return waysShown.join(", ");
  });

  await stage("canceled at Apple, and every tampered answer refused: nonce, audience, issuer, expiry, code, a client secret another key checks", async () => {
    // Seven starts in a row: the server allows 60 sign-in starts a minute from one address (AUTH_LIMITER), and the stages before
    // have used most of this minute's.
    await page.waitForTimeout(61_000);
    await signOut();
    await control({ apple: { cancel: true } });
    await way("apple").click();
    await page.waitForURL(/\/login\?error=cancelled&with=apple/);
    assert(await page.getByText("You canceled signing in with Apple.").isVisible(), "Apple's cancel said");
    for (const tamper of ["nonce", "aud", "iss", "expired", "bad-code", "secret"]) {
      await page.goto(`${BASE}/login`);
      await control({ apple: { sub: APPLE_SUB, tamper } });
      await way("apple").click();
      await page.waitForURL(/\/login\?error=provider&with=apple/);
      assert((await me()) === null, `${tamper}: signed in anyway`);
    }
    const refusedSecret = (await standinLog()).filter((e) => e.provider === "apple" && e.step === "token" && e.problems.includes("secret: signature"));
    assert(refusedSecret.length === 1, `the other key's check refused the secret once: ${refusedSecret.length}`);
    // Delete the Apple account this check made.
    await control({ apple: { sub: APPLE_SUB } });
    await way("apple").click();
    await appReady();
    await deleteThisAccount();
    return "1 canceled, 6 refused; account deleted";
  });
}

await stage("the browser without passkeys: said, and Google and GitHub still there", async () => {
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  const plain = await context.newPage();
  await plain.addInitScript(() => {
    delete window.PublicKeyCredential;
  });
  await plain.goto(`${BASE}/login`);
  await plain.getByText("This browser can't use passkeys.", { exact: false }).waitFor();
  assert(await plain.locator('[data-part="sign-in-button"][data-variant="passkey"]').isDisabled(), "passkey button off");
  assert(await plain.locator('[data-part="sign-in-button"][data-variant="google"]').isEnabled(), "Google on");
  await plain.screenshot({ path: join(OUT, "shots", "16-no-passkeys.png"), fullPage: true });
  await plain.close();
  return "said";
});

if (strayText.length) problems.push(...strayText.map((s) => `stray text: ${s}`));
await browser.close();
standin.kill();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} stages passed${problems.length ? `; ${problems.length} problems:\n  ${problems.join("\n  ")}` : ""}`);
process.exit(failed.length || problems.length ? 1 : 0);
