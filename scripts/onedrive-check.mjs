// OneDrive's sign-in end to end (public/js/storage.js, src/storage.ts), in headless Chrome on a LOCAL server, Microsoft played by this
// script and nothing reaching the real one: its authorize page and token endpoint for the browser (Playwright routes), its token endpoint
// for the server (a stand-in on --standin, which the server reaches through AUTH_STANDIN), and Graph's app folder in memory. Microsoft is
// played as its documentation describes the two kinds of client: a code sent to a redirect registered as a single-page app is redeemed
// only cross-origin (with an Origin, no secret; AADSTS9002327 otherwise) and its refresh tokens end 24 hours after the sign-in, however
// often they're used; one sent to the Web redirect only from a server (no Origin: AADSTS9002326) with the client secret, its refresh
// tokens good for 90 days from each use (https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens). Refresh tokens replace
// themselves on every use and the old ones keep working.
//
// --mode server (the server started with ONEDRIVE_CLIENT_SECRET): Settings → Sync across devices → Connect goes to Microsoft with the Web
// redirect and comes back through the server, never the browser, which never sees the secret; Check works; a refresh goes through the
// server and keeps Microsoft's new token; a sign-in Microsoft won't renew says so once, beside Connect, and nothing asks Microsoft again
// (never a loop); Connect makes a new one that works; a sign-in made the old way (the single-page app's) is renewed by the browser while
// its day lasts and, once it's over, ends the same way, once; the secret refused (expired): no sign-in ended, the words say it's the site's,
// counted in the error reports. --mode browser (no secret; the control: OneDrive as it always was): Connect with the single-page redirect,
// the code and every refresh traded by the browser itself, the server's OneDrive routes never called, and a sign-in that's over saying
// "OneDrive needs connecting again" with Check and Disconnect, as before. Both: the secret in no answer the browser gets, no request it
// sends, no line of --server-log and no row of the error reports (--persist-to); stills of the rows at 390.
//
//   node scripts/onedrive-check.mjs http://localhost:<port> <outDir> --mode server|browser --standin <port> --secret <the server's>
//        --persist-to <its state dir> [--server-log <file>]
// The server: --var STORAGE_REDIRECT_URI:http://localhost:<port>/app/storage/callback --var AUTH_STANDIN:http://localhost:<standin port>,
// and in server mode --var ONEDRIVE_CLIENT_SECRET:<a stand-in value>. Through gpu.py's parallel lane. It signs up a test account and
// deletes it (exit 0 = pass).

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const OUT = outArg && resolve(outArg);
const MODE = opt("mode");
const STANDIN = Number(opt("standin"));
const SECRET = opt("secret");
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const SERVER_LOG = opt("server-log") && resolve(opt("server-log"));
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !OUT || !["server", "browser"].includes(MODE) || !STANDIN || !SECRET || !PERSIST) {
  console.error("Usage: node scripts/onedrive-check.mjs http://localhost:<port> <outDir> --mode server|browser --standin <port> --secret <it> --persist-to <dir> [--server-log <file>]");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPA_REDIRECT = `${BASE}/app/storage/callback`;
const WEB_REDIRECT = `${BASE}/app/storage/onedrive`;
const HOUR = 3600_000;

let failed = 0;
const results = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// ---------- Microsoft, played ----------

const ms = { clientId: null, secretGood: true, codes: new Map(), refresh: new Map(), access: new Map(), log: [] };
const token = () => randomBytes(24).toString("base64url");
const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
const refused = (status, error, description) => ({ status, body: { error, error_description: `${description} Trace ID: 0 Correlation ID: 0 Timestamp: now` } });
/** The token endpoint, as either client meets it: form is the request's fields, origin its Origin header (a browser's) or none. */
function tokenEndpoint(form, origin, from) {
  const entry = { from, grant: form.grant_type, origin: Boolean(origin), secret: form.client_secret === undefined ? "none" : form.client_secret === SECRET ? "right" : "wrong" };
  ms.log.push(entry);
  if (form.client_id !== ms.clientId) return refused(400, "unauthorized_client", "AADSTS700016: Application not found.");
  let kind;
  let endsAt = null;
  if (form.grant_type === "authorization_code") {
    const code = ms.codes.get(form.code);
    if (!code || code.used) return refused(400, "invalid_grant", "AADSTS70008: The provided authorization code or refresh token has expired or was already used.");
    code.used = true;
    if (form.redirect_uri !== code.redirectUri) return refused(400, "invalid_grant", "AADSTS500112: The reply address does not match the one in the request.");
    if (b64url(createHash("sha256").update(form.code_verifier ?? "").digest()) !== code.challenge) return refused(400, "invalid_grant", "AADSTS501481: The Code_Verifier does not match the code_challenge.");
    kind = code.kind;
  } else if (form.grant_type === "refresh_token") {
    const old = ms.refresh.get(form.refresh_token);
    if (old) entry.kind = old.kind;
    if (!old || old.endsAt <= Date.now() || old.revoked) {
      return old?.kind === "spa"
        ? refused(400, "invalid_grant", "AADSTS700084: The refresh token was issued to a single page app (SPA), and therefore has a fixed, limited lifetime of 1.00:00:00, which cannot be extended.")
        : refused(400, "invalid_grant", "AADSTS70000: The provided grant has expired due to it being revoked.");
    }
    kind = old.kind;
    if (kind === "spa") endsAt = old.endsAt; // carried over: a day from the sign-in, however often it's used
  } else return refused(400, "unsupported_grant_type", "AADSTS70003");
  entry.kind = kind;
  if (kind === "spa") {
    if (!origin) return refused(400, "invalid_request", "AADSTS9002327: Tokens issued for the 'Single-Page Application' client-type may only be redeemed via cross-origin requests.");
    if (form.client_secret !== undefined) return refused(401, "invalid_client", "AADSTS700025: Client is public so neither 'client_assertion' nor 'client_secret' should be presented.");
  } else {
    if (origin) return refused(400, "invalid_request", "AADSTS9002326: Cross-origin token redemption is permitted only for the 'Single-Page Application' client-type.");
    if (form.client_secret !== SECRET) return refused(401, "invalid_client", "AADSTS7000215: Invalid client secret provided.");
    if (!ms.secretGood) return refused(401, "invalid_client", "AADSTS7000222: The provided client secret keys for app are expired.");
  }
  if (!/\bFiles\.ReadWrite\.AppFolder\b/.test(form.scope ?? "")) return refused(400, "invalid_scope", "AADSTS70011");
  const access = token();
  const refresh = `${kind}-${token()}`;
  ms.access.set(access, Date.now() + HOUR);
  ms.refresh.set(refresh, { kind, endsAt: endsAt ?? Date.now() + (kind === "spa" ? 24 * HOUR : 90 * 24 * HOUR) });
  return { status: 200, body: { token_type: "Bearer", scope: "Files.ReadWrite.AppFolder", expires_in: 3600, ext_expires_in: 3600, access_token: access, refresh_token: refresh } };
}

// The server's way: the stand-in AUTH_STANDIN points it at (src/storage.ts microsoftTokenUrl).
const standin = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (req.method !== "POST" || req.url !== "/microsoft/token") {
      res.writeHead(404).end();
      return;
    }
    const answer = tokenEndpoint(Object.fromEntries(new URLSearchParams(body)), req.headers.origin, "server");
    res.writeHead(answer.status, { "Content-Type": "application/json" }).end(JSON.stringify(answer.body));
  });
});
await new Promise((ok) => standin.listen(STANDIN, "localhost", ok));

// Graph's app folder, in memory.
const files = new Map(); // name → { bytes, eTag, modified }
const CORS = (origin) => ({ "Access-Control-Allow-Origin": origin ?? "*", "Access-Control-Allow-Headers": "authorization, content-type, if-match", "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS", "Access-Control-Expose-Headers": "*" });
const graph = async (route) => {
  const request = route.request();
  const headers = CORS(request.headers().origin);
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
  const json = (status, body) => route.fulfill({ status, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const bearer = (request.headers().authorization ?? "").replace(/^Bearer /, "");
  if (!(ms.access.get(bearer) > Date.now())) return json(401, { error: { code: "InvalidAuthenticationToken", message: "Access token has expired or is not yet valid." } });
  const url = new URL(request.url());
  const path = decodeURIComponent(url.pathname.replace("/v1.0/me/drive/special/approot", ""));
  const item = (name) => ({ name, size: files.get(name).bytes.length, lastModifiedDateTime: files.get(name).modified, eTag: files.get(name).eTag, file: {} });
  if (path === "" && request.method() === "GET") return json(200, { id: "approot", name: "Lexicommons", folder: {} });
  if (path === "/children") return json(200, { value: [...files.keys()].map(item) });
  const named = path.match(/^:\/(.+):\/content$/);
  if (named && request.method() === "PUT") {
    const name = named[1];
    const ifMatch = request.headers()["if-match"];
    if (ifMatch && files.get(name)?.eTag !== ifMatch) return json(412, { error: { code: "preconditionFailed" } });
    if (url.searchParams.get("@microsoft.graph.conflictBehavior") === "fail" && files.has(name)) return json(409, { error: { code: "nameAlreadyExists" } });
    files.set(name, { bytes: request.postDataBuffer() ?? Buffer.alloc(0), eTag: `"{${token()}},1"`, modified: new Date().toISOString() });
    return json(201, item(name));
  }
  if (named && request.method() === "GET") {
    if (!files.has(named[1])) return json(404, { error: { code: "itemNotFound" } });
    return route.fulfill({ status: 200, headers: { ...headers, "Content-Type": "application/octet-stream" }, body: files.get(named[1]).bytes });
  }
  return json(400, { error: { code: "invalidRequest", message: `${request.method()} ${path}: not played here` } });
};
// The browser's way: the authorize page answers at once with a code (a person who said yes), and the token endpoint.
const login = async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const origin = request.headers().origin;
  if (url.pathname.endsWith("/oauth2/v2.0/authorize")) {
    const q = url.searchParams;
    const redirect = q.get("redirect_uri");
    const kind = redirect === SPA_REDIRECT ? "spa" : redirect === WEB_REDIRECT ? "web" : null;
    ms.log.push({ from: "authorize", kind, redirect });
    const problem = !kind
      ? "AADSTS50011: The redirect URI specified in the request does not match the redirect URIs configured for the application."
      : q.get("client_id") !== ms.clientId
        ? "AADSTS700016: Application not found."
        : q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge") || !q.get("state")
          ? "AADSTS900144: The request is missing a required parameter."
          : !/\bFiles\.ReadWrite\.AppFolder\b/.test(q.get("scope") ?? "") || !/\boffline_access\b/.test(q.get("scope") ?? "")
            ? "AADSTS70011: The provided value for the input parameter 'scope' is not valid."
            : null;
    if (problem) return route.fulfill({ status: 400, contentType: "text/html", body: `<p id="ms-error">${problem}</p>` });
    const code = `M.C5_BAY.2.U.${token()}`;
    ms.codes.set(code, { challenge: q.get("code_challenge"), redirectUri: redirect, kind });
    return route.fulfill({ status: 302, headers: { Location: `${redirect}?${new URLSearchParams({ code, state: q.get("state") })}` } });
  }
  if (url.pathname.endsWith("/oauth2/v2.0/token")) {
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS(origin) });
    const answer = tokenEndpoint(Object.fromEntries(new URLSearchParams(request.postData() ?? "")), origin, "browser");
    return route.fulfill({ status: answer.status, headers: { ...CORS(origin), "Content-Type": "application/json" }, body: JSON.stringify(answer.body) });
  }
  return route.fulfill({ status: 404, body: "not played here" });
};

// ---------- the browser ----------

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
// Nothing leaves this computer: Microsoft and Graph are played, anything else outside is refused and counted.
const outside = [];
await context.route(/^https?:\/\/(?!localhost[:/])/, (route) => {
  outside.push(route.request().url());
  return route.abort();
});
await context.route(/^https:\/\/login\.microsoftonline\.com\//, login);
await context.route(/^https:\/\/graph\.microsoft\.com\//, graph);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));
// Everything the browser sends, and every answer from this site, for the secret.
const seen = [];
const asked = []; // every URL the page asked for
page.on("request", (r) => {
  asked.push(r.url());
  seen.push(`${r.method()} ${r.url()} ${JSON.stringify(r.headers())} ${r.postData() ?? ""}`);
});
page.on("response", async (r) => {
  if (!r.url().startsWith(BASE)) return;
  const type = r.headers()["content-type"] ?? "";
  if (/json|html|text/.test(type)) seen.push(`${r.url()} ${JSON.stringify(r.headers())} ${await r.text().catch(() => "")}`);
});

await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "OneDrive Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });

const here = () => page.locator('[data-part="page"]:not([data-ghost])').filter({ has: page.locator("h1, [data-part='page-title']", { hasText: /^Sync across devices/ }) });
const row = () => here().locator('[data-part="list-row"], li').filter({ has: page.locator(".lx-row-title", { hasText: /^OneDrive$/ }) }).first();
const said = () => here().locator(".lx-settings-message");
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("lc_storage_onedrive") ?? "null"));
const store = (value) => page.evaluate((v) => localStorage.setItem("lc_storage_onedrive", JSON.stringify(v)), value);
async function storagePage() {
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(300);
  await page.evaluate(() => (location.hash = "#settings/storage"));
  await row().waitFor({ timeout: 15_000 });
}
/** The row's line and buttons once its sync has settled. */
async function rowNow() {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-part="page"]:not([data-ghost]) .lx-row-title')].some((n) => n.textContent.trim() === "Syncing…"), null, { timeout: 30_000 });
  return {
    sub: ((await row().locator(".lx-row-sub").textContent({ timeout: 1000 }).catch(() => null)) ?? "").trim(),
    buttons: (await row().locator("button").allTextContents()).map((t) => t.trim()),
  };
}
async function press(name) {
  await row().getByRole("button", { name, exact: true }).click();
}
/** Check: writes a file through Graph, finds it and reads it back; the words it says after ("" when the row says it instead). */
async function check() {
  await said().evaluate((n) => n.replaceChildren());
  await press("Check");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-part="page"]:not([data-ghost]) .lx-settings-message')?.textContent.trim() ||
      [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) .lx-row-sub')].some((n) => /^Its sign-in ended/.test(n.textContent)),
    null,
    { timeout: 30_000 },
  );
  return (await said().textContent()).trim();
}
/** Said once: the page's words have "sign-in ended" only in the row's line, and the sync's status (its line, what's kept) not at all. */
async function saidOnce() {
  const text = await here().evaluate((n) => n.innerText);
  const times = text.split("sign-in ended").length - 1;
  assert(times === 1, `"sign-in ended" ${times} times on the page:\n${text}`);
  const status = await page.evaluate(() => import("/js/sync.js").then((s) => s.syncStatus()));
  assert(!JSON.stringify(status).includes("sign-in ended"), `in the sync's status: ${JSON.stringify(status).slice(0, 400)}`);
}
// Every page the tab opens, so a callback passed through on the way back is seen.
const visited = [];
page.on("framenavigated", (frame) => frame === page.mainFrame() && visited.push(frame.url()));
/** Connect: the real button, Microsoft's page answering yes, the callback, and back on Settings. Returns the callback's path. */
async function connect() {
  const from = visited.length;
  const isCallback = (u) => /\/app\/storage\/(callback|onedrive)\?/.test(u);
  await press("Connect");
  // The page is on #settings/storage already: wait for the way out through a callback and back again, by the pages the tab opened.
  const until = Date.now() + 30_000;
  while (!(visited.slice(from).some(isCallback) && visited.slice(from).at(-1) === `${BASE}/app/#settings/storage`)) {
    if (Date.now() > until) throw new Error(`no way back from Connect: ${visited.slice(from).join(" → ") || "(the tab went nowhere)"}`);
    await page.waitForTimeout(100);
  }
  const callbacks = visited.slice(from).filter(isCallback).map((u) => new URL(u).pathname);
  const callback = callbacks.length === 1 ? callbacks[0] : `${callbacks.length} callbacks: ${visited.slice(from).join(" → ")}`;
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await row().waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => /OneDrive connected/.test(document.querySelector('[data-part="page"]:not([data-ghost]) .lx-settings-message')?.textContent ?? ""), null, { timeout: 15_000 });
  return callback;
}
const expireAccess = async () => store({ ...(await stored()), expiresAt: 0 });
const since = (n) => ms.log.slice(n);

console.log(`onedrive check (${MODE}): ${BASE}`);
const config = await page.evaluate(async () => (await fetch("/api/storage/config")).json());
ms.clientId = config.onedrive.clientId;

await stage(`the server says OneDrive goes ${MODE === "server" ? "through it, with the Web redirect" : "the single-page app's way"}`, async () => {
  if (MODE === "server") assert(config.onedrive.via === "server" && config.onedrive.redirectUri === WEB_REDIRECT, JSON.stringify(config.onedrive));
  else assert(config.onedrive.via === "browser" && !("redirectUri" in config.onedrive), JSON.stringify(config.onedrive));
  assert(config.redirectUri === SPA_REDIRECT, `the server's STORAGE_REDIRECT_URI is ${config.redirectUri}: start it with --var STORAGE_REDIRECT_URI:${SPA_REDIRECT}`);
});

await storagePage();
await page.screenshot({ path: join(OUT, "1-not-connected.png") });

await stage(`Connect: Microsoft's page, then the ${MODE === "server" ? "Web redirect, the code traded by the server with the secret" : "single-page redirect, the code traded by the browser"}`, async () => {
  const n = ms.log.length;
  const callback = await connect();
  const log = since(n);
  const trade = log.find((e) => e.grant === "authorization_code");
  if (MODE === "server") {
    assert(callback === "/app/storage/onedrive", `came back to ${callback}`);
    assert(trade && trade.from === "server" && trade.kind === "web" && !trade.origin && trade.secret === "right", JSON.stringify(log));
    assert((await stored()).via === "server", JSON.stringify(await stored()));
  } else {
    assert(callback === "/app/storage/callback", `came back to ${callback}`);
    assert(trade && trade.from === "browser" && trade.kind === "spa" && trade.origin && trade.secret === "none", JSON.stringify(log));
    assert(!("via" in (await stored())), JSON.stringify(await stored()));
  }
  assert(log.filter((e) => e.grant).length === 1, `${log.filter((e) => e.grant).length} token calls`);
  return log.map((e) => `${e.from}${e.kind ? ` ${e.kind}` : ""}`).join(", ");
});

await stage("connected: the row says so, Check writes, lists and reads a file through Graph", async () => {
  const words = await check();
  assert(/^OneDrive works/.test(words), words);
  const now = await rowNow();
  assert(now.buttons.join() === "Check,Disconnect", now.buttons.join());
  assert(files.has("lexicommons-check.json"), [...files.keys()].join());
  await page.screenshot({ path: join(OUT, "2-connected.png") });
  return now.sub;
});

await stage(`a refresh goes ${MODE === "server" ? "through the server with the secret" : "from the browser"}, and Microsoft's new refresh token is kept`, async () => {
  const before = await stored();
  await expireAccess();
  const n = ms.log.length;
  const words = await check();
  assert(/^OneDrive works/.test(words), words);
  // One, or two if a sync renewed it at the same moment (Microsoft keeps old refresh tokens working); every one the right way.
  const refreshes = since(n).filter((e) => e.grant === "refresh_token");
  assert(refreshes.length >= 1 && refreshes.length <= 2, JSON.stringify(since(n)));
  for (const r of refreshes) {
    if (MODE === "server") assert(r.from === "server" && !r.origin && r.secret === "right" && r.kind === "web", JSON.stringify(r));
    else assert(r.from === "browser" && r.origin && r.secret === "none" && r.kind === "spa", JSON.stringify(r));
  }
  const after = await stored();
  assert(after.refreshToken !== before.refreshToken && ms.refresh.has(after.refreshToken), "the new refresh token wasn't kept");
  assert(after.via === before.via, "its way changed");
});

if (MODE === "server") {
  await stage("a sign-in Microsoft won't renew (90 days unused): said once beside Connect, the tokens gone, and nothing asks Microsoft again", async () => {
    ms.refresh.get((await stored()).refreshToken).revoked = true;
    await expireAccess();
    const n = ms.log.length;
    const words = await check();
    assert(words === "", `Check said it too: ${words}`);
    const now = await rowNow();
    assert(now.sub === "Its sign-in ended. Connect it again to keep syncing." && now.buttons.join() === "Connect", JSON.stringify(now));
    await saidOnce();
    const left = await stored();
    assert(left && left.ended && !left.refreshToken && !left.accessToken, JSON.stringify(left));
    await page.screenshot({ path: join(OUT, "3-ended.png") });
    const before = since(n).filter((e) => e.grant);
    assert(before.length >= 1 && before.every((e) => e.from === "server" && e.grant === "refresh_token"), JSON.stringify(before));
    // Never a loop: syncing again, and the page opened again, ask Microsoft nothing more once it's ended.
    const ended = ms.log.length;
    await page.evaluate(() => import("/js/sync.js").then((s) => s.syncNow()));
    await storagePage();
    await page.waitForTimeout(1500);
    assert(!since(ended).some((e) => e.grant), `asked again: ${JSON.stringify(since(ended))}`);
    assert((await rowNow()).sub === "Its sign-in ended. Connect it again to keep syncing.", "the line went");
  });

  await stage("Connect again: a new sign-in through the server, working, the line gone", async () => {
    const callback = await connect();
    assert(callback === "/app/storage/onedrive", callback);
    const words = await check();
    assert(/^OneDrive works/.test(words), words);
    const now = await rowNow();
    assert(now.buttons.join() === "Check,Disconnect" && !/ended/.test(now.sub), JSON.stringify(now));
    await page.screenshot({ path: join(OUT, "4-connected-again.png") });
  });

  await stage("a sign-in made the old way, still within its day: renewed by the browser as before (no early Connect)", async () => {
    const spa = `spa-${token()}`;
    ms.refresh.set(spa, { kind: "spa", endsAt: Date.now() + 10 * HOUR });
    await store({ accessToken: "old", refreshToken: spa, expiresAt: 0 });
    const n = ms.log.length;
    const words = await check();
    assert(/^OneDrive works/.test(words), words);
    const r = since(n).find((e) => e.grant === "refresh_token");
    assert(r && r.from === "browser" && r.kind === "spa" && r.origin, JSON.stringify(since(n)));
    assert(!("via" in (await stored())), "it became a server sign-in by itself");
  });

  await stage("a sign-in made the old way, its day over: ended once, beside Connect, and never asked again", async () => {
    const spa = `spa-${token()}`;
    ms.refresh.set(spa, { kind: "spa", endsAt: Date.now() - 1 });
    await store({ accessToken: "old", refreshToken: spa, expiresAt: 0 });
    const n = ms.log.length;
    await storagePage(); // opening the page syncs
    await page.waitForFunction(() => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) .lx-row-sub')].some((n) => /^Its sign-in ended/.test(n.textContent)), null, { timeout: 30_000 });
    const now = await rowNow();
    assert(now.sub === "Its sign-in ended. Connect it again to keep syncing." && now.buttons.join() === "Connect", JSON.stringify(now));
    await saidOnce();
    const asked = since(n).filter((e) => e.grant);
    assert(asked.length >= 1 && asked.every((e) => e.from === "browser" && e.kind === "spa" && e.grant === "refresh_token"), JSON.stringify(asked));
    const ended = ms.log.length;
    await page.evaluate(() => import("/js/sync.js").then((s) => s.syncNow()));
    await page.waitForTimeout(1500);
    assert(!since(ended).some((e) => e.grant), `asked again: ${JSON.stringify(since(ended))}`);
    await page.screenshot({ path: join(OUT, "5-old-way-ended.png") });
    const callback = await connect();
    assert(callback === "/app/storage/onedrive" && (await stored()).via === "server", "the new sign-in isn't the server's");
    assert(/^OneDrive works/.test(await check()), "after connecting again");
  });

  await stage("the secret refused (expired): no sign-in ended, the words say it's the site's, the row still connected", async () => {
    ms.secretGood = false;
    await expireAccess();
    const words = await check();
    ms.secretGood = true;
    assert(words === "OneDrive: Lexicommons couldn't reach it just now; it tries again in a while.", words);
    const now = await rowNow();
    assert(now.buttons.join() === "Check,Disconnect", JSON.stringify(now));
    assert((await stored()).refreshToken, "the tokens went");
    assert(/^OneDrive works/.test(await check()), "once the secret is good again");
  });

  await stage("the server never sent the browser to Microsoft's token endpoint, and sent nothing there itself but with the secret", async () => {
    const serverCalls = ms.log.filter((e) => e.from === "server");
    assert(serverCalls.length >= 4 && serverCalls.every((e) => !e.origin && e.secret === "right"), JSON.stringify(serverCalls));
    const browserCalls = ms.log.filter((e) => e.from === "browser");
    assert(browserCalls.every((e) => e.kind === "spa" && e.grant === "refresh_token"), JSON.stringify(browserCalls));
  });
} else {
  await stage("the control: a sign-in that's over says \"OneDrive needs connecting again\", with Check and Disconnect, as it always did", async () => {
    ms.refresh.get((await stored()).refreshToken).endsAt = Date.now() - 1;
    await expireAccess();
    const words = await check();
    assert(words === "OneDrive: OneDrive needs connecting again.", words);
    const now = await rowNow();
    assert(now.buttons.join() === "Check,Disconnect", JSON.stringify(now));
    assert(!(await stored()).ended, "ended in browser mode");
    await page.screenshot({ path: join(OUT, "3-browser-over.png") });
  });
  await stage("the server's OneDrive routes were never called, and Microsoft heard only from the browser", async () => {
    const called = asked.filter((url) => /\/api\/storage\/onedrive\//.test(url));
    assert(!called.length, called.join(", "));
    assert(ms.log.every((e) => e.from !== "server"), JSON.stringify(ms.log.filter((e) => e.from === "server")));
  });
}

await stage("Disconnect forgets it", async () => {
  await press("Disconnect");
  await page.waitForTimeout(500);
  assert((await stored()) === null, JSON.stringify(await stored()));
  assert((await rowNow()).buttons.join() === "Connect", "no Connect");
});

// ---------- the secret, nowhere ----------

const gone = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
await stage("the test account is deleted", async () => assert(gone === 200, String(gone)));
await browser.close();
standin.close();

await stage("the secret in nothing the browser sent or this site answered", async () => {
  assert(seen.length > 50, `only ${seen.length} requests and answers seen`);
  const hits = seen.filter((s) => s.includes(SECRET) || s.includes(encodeURIComponent(SECRET)));
  assert(!hits.length, hits.map((h) => h.slice(0, 160)).join("\n"));
  return `${seen.length} requests and answers`;
});
await stage("the secret in no line of the server's log", async () => {
  if (!SERVER_LOG) return "no --server-log given";
  assert(existsSync(SERVER_LOG), SERVER_LOG);
  const log = readFileSync(SERVER_LOG, "utf8");
  assert(log.length > 0 && !log.includes(SECRET), "it's there");
  return `${log.split("\n").length} lines`;
});
await stage(`the secret in no error report${MODE === "server" ? "; the refused secret counted there as the site's" : ""}`, async () => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", "SELECT message, place, stack FROM error_groups"], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  const groups = JSON.parse(out.slice(out.indexOf("[")))[0].results;
  assert(!JSON.stringify(groups).includes(SECRET), "it's there");
  if (MODE === "server") assert(groups.some((g) => /OneDrive's refresh: Microsoft answered 401 invalid_client/.test(g.message) && g.place === "POST /api/storage/onedrive/refresh"), JSON.stringify(groups));
  return `${groups.length} groups`;
});
await stage("nothing reached the internet: Microsoft and Graph played, everything else refused", async () => assert(!outside.length, outside.slice(0, 5).join("\n")));
await stage("no console errors", async () => {
  // A refused refresh is logged by nothing; Chrome itself logs a failed request's status, which these stages make on purpose.
  const own = consoleErrors.filter((e) => !/Failed to load resource: the server responded with a status of (400|401|404|502)/.test(e) && !/net::ERR_FAILED/.test(e));
  assert(!own.length, own.join("\n"));
});

writeFileSync(join(OUT, "results.json"), JSON.stringify({ mode: MODE, results, microsoft: ms.log }, null, 1));
console.log(failed ? `onedrive check (${MODE}): ${failed} of ${results.length} stages FAILED` : `onedrive check (${MODE}): all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
