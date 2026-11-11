// Checks that a refresh token used twice gets one answer (src/refresh-once.ts), over HTTP on a LOCAL server, as an AI
// app would: an account signed up through the Google stand-in, an OAuth client connected to it (DCR, PKCE, consent),
// then the race Claude Code's sessions run (two refreshes with one token, the first answer saved last), refreshes sent
// at the same instant, a repeat's lifetime and headers, a used token generations back, a request that differs, an app
// disconnected, a revoked access token, an app with a client secret, bodies past the limit (declared and streamed), a
// kept answer moved or changed, a first use that died, one still in progress, what's kept in D1, and the account's
// delete. With --reproduce it runs only the race, on a server without the guard, and passes when the race breaks the
// chain the way it did live (the next refresh refused). No browser: it needs no GPU-queue ticket.
//
// Local server (its own state; the stand-in's port must match), as auth-check's header says:
//   npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>
//   npx wrangler dev --port <port> --local-upstream localhost:<port> --persist-to <dir> --var GATE_ENABLED:false \
//     --var PUBLIC_ORIGIN:http://localhost:<port> --var RP_ID:localhost --var UPLOAD_SIGNING_SECRET:<any> \
//     --var AUTH_STANDIN:http://localhost:<standin port> \
//     --var GOOGLE_SIGNIN_CLIENT_ID:standin-google-client --var GOOGLE_SIGNIN_CLIENT_SECRET:standin-google-secret \
//     --var GITHUB_CLIENT_ID:standin-github-client --var GITHUB_CLIENT_SECRET:standin-github-secret
// Usage: node scripts/refresh-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--standin-port 8828] [--reproduce]

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--persist-to", "--standin-port"]);
const [BASE, outArg = "refresh-check-out"] = args.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1]));
const flag = (name) => (args.indexOf(name) === -1 ? undefined : args[args.indexOf(name) + 1]);
const OUT = resolve(outArg);
const PERSIST = flag("--persist-to") && resolve(flag("--persist-to"));
const STANDIN_PORT = Number(flag("--standin-port") ?? 8828);
const REPRODUCE = args.includes("--reproduce");
if (!BASE || !/^http:\/\/localhost:\d+$/.test(BASE)) {
  console.error("refresh-check creates and deletes an account: give it a local server, e.g. http://localhost:8827");
  process.exit(2);
}
if (!PERSIST) {
  console.error("--persist-to <dir>: the local server's state, to read and age its D1 rows");
  process.exit(2);
}
if (!Number.isInteger(STANDIN_PORT) || STANDIN_PORT < 1 || STANDIN_PORT > 65535) {
  console.error(`--standin-port: not a port (${flag("--standin-port")})`);
  process.exit(2);
}
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const STANDIN = `http://localhost:${STANDIN_PORT}`;
const RESOURCE = `${BASE}/mcp`;
const LOOPBACK = "http://127.0.0.1:53682/callback";
mkdirSync(OUT, { recursive: true });

const results = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    const why = `${error?.message ?? error}${error?.cause ? ` (${error.cause.code ?? ""} ${error.cause.message ?? error.cause})` : ""}${error?.stderr ? ` stderr: ${String(error.stderr).slice(-600)}` : ""}`;
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: why });
    console.log(`FAIL  ${name}: ${why}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ---------- the stand-in Google, and the local D1 ----------

const standin = spawn(process.execPath, [join(HERE, "auth-standin.mjs"), String(STANDIN_PORT), BASE], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((done, fail) => {
  standin.stdout.once("data", done);
  standin.once("exit", (code) => fail(new Error(`the stand-in exited (${code}): is port ${STANDIN_PORT} free?`)));
});
const control = (answers) => fetch(`${STANDIN}/control`, { method: "POST", body: JSON.stringify(answers) }).then((r) => r.json());
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], {
    cwd: APP,
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// ---------- HTTP with cookies, as a browser would keep them for this origin ----------

const jar = new Map();
async function go(url, init = {}) {
  const headers = new Headers(init.headers);
  if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  if (init.method && init.method !== "GET") headers.set("Origin", BASE);
  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const at = pair.indexOf("=");
    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    if (!value || /max-age=0/i.test(cookie)) jar.delete(name);
    else jar.set(name, value);
  }
  return response;
}
const form = (fields) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
const located = (response, what) => {
  assert(response.status >= 300 && response.status < 400, `${what}: ${response.status}`);
  return new URL(response.headers.get("Location"), BASE).toString();
};

// ---------- an account, and AI apps connected to it ----------

const RUN = Date.now().toString(36);
let accountId = null;

async function signUp() {
  await control({ google: { sub: `g-refresh-${RUN}`, name: "Refresh check" } });
  const toGoogle = located(await go(`${BASE}/login/google`, form({ next: "/app/", intent: "signin" })), "start");
  const back = located(await fetch(toGoogle, { redirect: "manual" }), "stand-in authorize");
  const toCreate = located(await go(back), "callback");
  assert(new URL(toCreate).pathname === "/login/new", `callback went to ${toCreate}`);
  located(await go(`${BASE}/login/new`, form({ name: "Refresh check" })), "create");
  const me = await (await go(`${BASE}/api/me`)).json();
  assert(me.user?.id, `signed up: ${JSON.stringify(me)}`);
  return me.user.id;
}

// A public app (as Claude Code is), or with { secret: "post" | "basic" } one that authenticates with a client secret.
async function connect(name, { secret = null } = {}) {
  const registered = await (
    await fetch(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: name, redirect_uris: [LOOPBACK], token_endpoint_auth_method: secret ? `client_secret_${secret}` : "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    })
  ).json();
  assert(!secret || registered.client_secret, `register with a secret: ${JSON.stringify(registered)}`);
  assert(registered.client_id, `register: ${JSON.stringify(registered)}`);
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(`${BASE}/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: registered.client_id,
    redirect_uri: LOOPBACK,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: `refresh-check-${name}`,
    scope: "learn:read learn:write",
    resource: RESOURCE,
  }))
    authorize.searchParams.set(k, v);
  const consent = await go(authorize.toString());
  const html = await consent.text();
  assert(consent.status === 200, `consent page: ${consent.status}`);
  const handle = html.match(/name="handle" value="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  // The form's other hidden field, as a browser posts it: which account the page was drawn for (app.ts consentMark).
  const account = html.match(/name="account" value="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") ?? "";
  assert(handle, "consent handle");
  const back = new URL(located(await go(`${BASE}/authorize`, form({ handle, account, decision: "approve" })), "approve"));
  assert(back.searchParams.get("code"), `approve: ${back}`);
  // With Basic the client's id goes in the header only: the library refuses it in both.
  const exchange = form({ grant_type: "authorization_code", code: back.searchParams.get("code"), redirect_uri: LOOPBACK, ...(secret === "basic" ? {} : { client_id: registered.client_id }), code_verifier: verifier, resource: RESOURCE, ...(secret === "post" ? { client_secret: registered.client_secret } : {}) });
  if (secret === "basic") exchange.headers = { ...exchange.headers, Authorization: basic(registered.client_id, registered.client_secret) };
  const tokens = await (await fetch(`${BASE}/token`, exchange)).json();
  assert(tokens.access_token && tokens.refresh_token, `code exchange: ${JSON.stringify(tokens)}`);
  return { clientId: registered.client_id, clientSecret: registered.client_secret, tokens };
}

const basic = (id, secret) => `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}`;
// The library's grant in the local KV: which refresh tokens it holds (their hashes).
const grantOf = (token) => {
  const [user, grant] = token.split(":");
  const out = execFileSync("npx", ["wrangler", "kv", "key", "get", `grant:${user}:${grant}`, "--binding", "OAUTH_KV", "--local", "--persist-to", PERSIST], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("{")));
};

// Claude Code's refresh, as its MCP SDK sends it: the token, the client, the resource.
const seen = new Set(); // every token this run was handed, to look for in D1
// clientId null: a client authenticating with HTTP Basic, whose id goes in the header only.
async function refresh(token, clientId, extra = {}, headers = {}) {
  const request = form({ grant_type: "refresh_token", refresh_token: token, ...(clientId ? { client_id: clientId } : {}), resource: RESOURCE, ...extra });
  const response = await fetch(`${BASE}/token`, { ...request, headers: { ...request.headers, ...headers } });
  const body = await response.json().catch(() => ({}));
  if (body.access_token) seen.add(body.access_token);
  if (body.refresh_token) seen.add(body.refresh_token);
  return { status: response.status, ...body, headers: Object.fromEntries(response.headers) };
}
const works = async (token, clientId) => (await refresh(token, clientId)).status === 200;
// The D1 row a token's uses go through (src/refresh-once.ts: its id is a hash of the token).
const rowId = (token) => sha256(`lexicommons refresh-once answer\n${token}`);
// The grant's lock (src/refresh-once.ts), held while the library refreshes it.
const lockId = (token) => sha256(`lexicommons refresh-once lock\n${token.split(":").slice(0, 2).join(":")}`);
async function whoami(accessToken) {
  const call = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }),
  });
  if (call.status !== 200) return { status: call.status };
  const line = (await call.text()).split("\n").find((l) => l.startsWith("data: "));
  return { status: 200, ...JSON.parse(JSON.parse(line.slice(6)).result.content[0].text) };
}
const refused = (answer) => answer.status === 400 && answer.error === "invalid_grant" && !answer.access_token && !answer.refresh_token;

// ---------- the run ----------

let A; // the app the races run on
let latest; // the newest refresh token A holds
await stage("an account, signed up through Google, and an AI app connected to it", async () => {
  accountId = await signUp();
  A = await connect("Refresh check A");
  latest = A.tokens.refresh_token;
  seen.add(A.tokens.access_token).add(latest);
  const who = await whoami(A.tokens.access_token);
  assert(who.userId === accountId && who.via === "oauth", `whoami: ${JSON.stringify(who)}`);
  return `account ${accountId.slice(0, 6)}…, access ${A.tokens.expires_in} s`;
});

if (REPRODUCE) {
  await stage("Claude Code's race on a server without the guard: two refreshes with one token, the first saved last", async () => {
    const first = await refresh(latest, A.clientId);
    const second = await refresh(latest, A.clientId);
    assert(first.status === 200 && second.status === 200, `refreshes: ${first.status} ${second.status}`);
    assert(first.refresh_token !== second.refresh_token, "the server gave one answer: there's no race to reproduce here");
    const stored = first.refresh_token; // the first answer, saved last
    const next = await refresh(stored, A.clientId);
    assert(refused(next), `the saved token still works (${next.status} ${next.error ?? ""}): not reproduced`);
    const other = await refresh(second.refresh_token, A.clientId);
    return `two different answers; the saved one refused at the next refresh (${next.error}: "${next.error_description}"); the other copy ${other.status}`;
  });
  await stage("five refreshes at the same instant on a server without the guard: most of what they're given is dead", async () => {
    const R = await connect("Refresh check R");
    const answers = await Promise.all(Array.from({ length: 5 }, () => refresh(R.tokens.refresh_token, R.clientId)));
    const given = [...new Set(answers.filter((a) => a.status === 200).map((a) => a.refresh_token))];
    const alive = [];
    for (const token of given) if ((await refresh(token, R.clientId)).status === 200) alive.push(token);
    assert(given.length > 1 && alive.length < given.length, `${given.length} refresh tokens given, ${alive.length} alive: not reproduced`);
    return `statuses ${answers.map((a) => a.status).join(" ")}; ${given.length} different refresh tokens given, ${given.length - alive.length} of them already dead`;
  });
} else {
  await stage("Claude Code's race: two refreshes with one token, the first answer saved last, then the next refresh works", async () => {
    const first = await refresh(latest, A.clientId);
    const second = await refresh(latest, A.clientId);
    assert(first.status === 200 && second.status === 200, `refreshes: ${first.status} ${second.status}`);
    assert(second.refresh_token === first.refresh_token && second.access_token === first.access_token, "two different answers for one token");
    for (const name of ["content-type", "cache-control", "pragma"]) assert(first.headers[name] && first.headers[name] === second.headers[name], `${name}: ${first.headers[name]} then ${second.headers[name]}`);
    const next = await refresh(first.refresh_token, A.clientId); // the copy saved last
    assert(next.status === 200, `the next refresh: ${next.status} ${next.error ?? ""}`);
    for (const token of [first.access_token, next.access_token]) {
      const who = await whoami(token);
      assert(who.userId === accountId, `whoami: ${JSON.stringify(who)}`);
    }
    latest = next.refresh_token;
    return `one answer to both, the same headers (${first.headers["cache-control"]}); the next refresh 200; /mcp answers with each access token`;
  });

  await stage("requests the runtime's parser reads as the same refresh (a stray ?, %, BOMs, an unknown parameter) get the same answer", async () => {
    const P = await connect("Refresh check P");
    const r0 = P.tokens.refresh_token;
    const first = await refresh(r0, P.clientId);
    assert(first.status === 200, `first: ${first.status}`);
    const plain = new URLSearchParams({ grant_type: "refresh_token", refresh_token: r0, client_id: P.clientId, resource: RESOURCE }).toString();
    const variants = {
      "a leading ? on a secret": `?client_secret=x&${plain}`,
      "an empty client_id written as %": `${plain}&client_id=%`,
      "an empty client_secret written as %": `${plain}&client_secret=%`,
      "a % in a name": plain.replace("grant_type=", "grant_type%="),
      "two byte order marks": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]), Buffer.from(plain)]),
      "an unknown parameter": `${plain}&unknown=1`,
    };
    const said = {};
    for (const [what, body] of Object.entries(variants)) {
      const response = await fetch(`${BASE}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      const answer = await response.json().catch(() => ({}));
      if (answer.refresh_token) seen.add(answer.refresh_token);
      if (answer.access_token) seen.add(answer.access_token);
      // workerd reads every one of these as the plain refresh, so each must get the kept answer.
      assert(response.status === 200 && answer.refresh_token === first.refresh_token, `${what}: ${response.status} ${answer.error ?? ""}${answer.refresh_token ? " (a different refresh token)" : ""}`);
      said[what] = "the same answer";
    }
    assert(await works(first.refresh_token, P.clientId), "the first answer no longer refreshes");
    return said;
  });

  await stage("eight refreshes at the same instant: one answer, and the chain goes on", async () => {
    const answers = await Promise.all(Array.from({ length: 8 }, () => refresh(latest, A.clientId)));
    assert(answers.every((a) => a.status === 200), `statuses: ${answers.map((a) => `${a.status}${a.error ? ` ${a.error}` : ""}`).join(", ")}`);
    const refreshTokens = new Set(answers.map((a) => a.refresh_token));
    const accessTokens = new Set(answers.map((a) => a.access_token));
    assert(refreshTokens.size === 1 && accessTokens.size === 1, `${refreshTokens.size} refresh tokens, ${accessTokens.size} access tokens`);
    const next = await refresh([...refreshTokens][0], A.clientId);
    assert(next.status === 200, `the next refresh: ${next.status} ${next.error ?? ""}`);
    latest = next.refresh_token;
    return "8 × 200, one refresh token and one access token; the next refresh 200";
  });

  await stage("a repeat counts the access token's lifetime from when it was issued, and keeps the CORS answer", async () => {
    const origin = { Origin: "https://app.example" };
    const first = await refresh(latest, A.clientId, {}, origin);
    await sleep(2_300);
    const again = await refresh(latest, A.clientId, {}, origin);
    assert(again.refresh_token === first.refresh_token, "a different answer");
    const less = first.expires_in - again.expires_in;
    assert(less >= 2 && less <= 4, `expires_in ${first.expires_in} then ${again.expires_in}`);
    assert(first.headers["access-control-allow-origin"] === origin.Origin, `allow-origin: ${first.headers["access-control-allow-origin"]}`);
    const cors = Object.keys(first.headers).filter((name) => name.startsWith("access-control-"));
    for (const name of cors) assert(first.headers[name] === again.headers[name], `${name}: ${first.headers[name]} then ${again.headers[name]}`);
    latest = first.refresh_token;
    return `expires_in ${first.expires_in}, then ${again.expires_in}; ${cors.length} CORS headers the same`;
  });

  await stage("a used token two generations back gets nothing, even inside the window", async () => {
    const r0 = latest;
    const r1 = (await refresh(r0, A.clientId)).refresh_token;
    const r2 = (await refresh(r1, A.clientId)).refresh_token;
    assert(r1 && r2, "the chain");
    const old = await refresh(r0, A.clientId); // R0's kept answer is R1, but the grant has moved past R0
    assert(refused(old), `R0 again: ${old.status} ${old.refresh_token === r1 ? "(R1, the kept answer)" : ""}`);
    const repeat = await refresh(r1, A.clientId); // R1 is still the one before the current: its repeat holds
    assert(repeat.status === 200 && repeat.refresh_token === r2, `R1 again: ${repeat.status}, ${repeat.refresh_token === r2 ? "R2" : "not R2"}`);
    const r3 = (await refresh(r2, A.clientId)).refresh_token;
    const older = await refresh(r1, A.clientId);
    assert(refused(older), `R1 after R3: ${older.status}`);
    latest = r3;
    return "R0 refused after R2; R1's repeat gets R2; R1 refused after R3";
  });

  await stage("another app can't use the token, before or after its first use, and never gets the kept answer", async () => {
    const B = await connect("Refresh check B");
    const before = await refresh(latest, B.clientId);
    assert(refused(before), `B before A's use: ${before.status} ${before.error}`);
    const first = await refresh(latest, A.clientId); // B's refusal left no claim behind
    assert(first.status === 200, `A after B's refusal: ${first.status} ${first.error ?? ""}`);
    const after = await refresh(latest, B.clientId);
    assert(refused(after) && after.refresh_token !== first.refresh_token, `B after A's use: ${after.status} ${after.error}`);
    const mine = await refresh(B.tokens.refresh_token, B.clientId);
    assert(mine.status === 200, `B's own token: ${mine.status}`);
    latest = first.refresh_token;
    return `B refused both times (${before.error_description}); A 200 between; B's own token 200`;
  });

  await stage("forged, truncated and made-up tokens are refused, and leave nothing that blocks the real one", async () => {
    const [user, grant, secret] = latest.split(":");
    const flip = (s) => s.slice(0, -1) + (s.at(-1) === "A" ? "B" : "A");
    const forged = {
      "last character changed": `${user}:${grant}:${flip(secret)}`,
      "secret cut short": `${user}:${grant}:${secret.slice(0, 8)}`,
      "no secret": `${user}:${grant}:`,
      "two parts": `${user}:${grant}`,
      "another grant": `${user}:${flip(grant)}:${secret}`,
      "made up": `${randomBytes(16).toString("base64url")}:${randomBytes(12).toString("base64url")}:${randomBytes(24).toString("base64url")}`,
      "too long": `${user}:${grant}:${"x".repeat(300)}`,
    };
    const statuses = {};
    for (const [what, token] of Object.entries(forged)) {
      const answers = [await refresh(token, A.clientId), await refresh(token, A.clientId)];
      for (const answer of answers) assert(answer.status === 400 && !answer.access_token && !answer.refresh_token, `${what}: ${answer.status} ${answer.error}`);
      statuses[what] = answers[0].error;
    }
    const real = await refresh(latest, A.clientId);
    assert(real.status === 200, `the real token afterwards: ${real.status}`);
    latest = real.refresh_token;
    return statuses;
  });

  await stage("after a request that differs, the original's repeat isn't given the dead answer, and what it gets works", async () => {
    const r0 = latest;
    const first = await refresh(r0, A.clientId);
    const narrower = await refresh(r0, A.clientId, { scope: "learn:read" }); // the library rotates again: first's R1 is dead
    assert(narrower.status === 200 && narrower.refresh_token !== first.refresh_token && narrower.scope === "learn:read", `narrower: ${narrower.status} ${narrower.scope}`);
    const again = await refresh(r0, A.clientId);
    assert(again.status === 200 && again.refresh_token !== first.refresh_token, `the original again: ${again.status}, ${again.refresh_token === first.refresh_token ? "the dead kept answer" : "a new one"}`);
    assert(await works(again.refresh_token, A.clientId), "what the repeat got doesn't work");
    latest = null; // works() spent it; the chain goes on from the next stage's own app
    return "the repeat got a new answer from the library, and it refreshes";
  });

  let C;
  await stage("an app disconnected in Settings: a repeat inside the window gets nothing", async () => {
    C = await connect("Refresh check C");
    const first = await refresh(C.tokens.refresh_token, C.clientId);
    assert(first.status === 200, `first: ${first.status}`);
    const grantId = C.tokens.refresh_token.split(":")[1];
    const gone = await go(`${BASE}/api/connections/${grantId}`, { method: "DELETE" });
    assert(gone.status === 200, `disconnect: ${gone.status}`);
    const again = await refresh(C.tokens.refresh_token, C.clientId);
    assert(refused(again), `the repeat: ${again.status} ${again.error}`);
    return `the repeat ${again.status} ${again.error}`;
  });

  await stage("a revoked access token isn't handed out again", async () => {
    const D = await connect("Refresh check D");
    const first = await refresh(D.tokens.refresh_token, D.clientId);
    const revoked = await fetch(`${BASE}/token`, form({ token: first.access_token, token_type_hint: "access_token", client_id: D.clientId }));
    assert(revoked.status === 200, `revoke: ${revoked.status}`);
    assert((await whoami(first.access_token)).status === 401, "the revoked token still answers");
    const again = await refresh(D.tokens.refresh_token, D.clientId);
    assert(again.status === 200 && again.access_token !== first.access_token, `the repeat: ${again.status}, ${again.access_token === first.access_token ? "the revoked token" : "a new one"}`);
    assert((await whoami(again.access_token)).userId === accountId, "the new access token");
    return "the repeat went to the library and got a live access token";
  });

  await stage("apps with a client secret (in the body, or Basic) go straight to the library: no kept answer, a wrong secret refused", async () => {
    const said = [];
    for (const how of ["post", "basic"]) {
      const S = await connect(`Refresh check S ${how}`, { secret: how });
      const send = (token, secret) => (how === "post" ? refresh(token, S.clientId, { client_secret: secret }) : refresh(token, null, {}, { Authorization: basic(S.clientId, secret) }));
      const first = await send(S.tokens.refresh_token, S.clientSecret);
      const second = await send(S.tokens.refresh_token, S.clientSecret);
      assert(first.status === 200 && second.status === 200 && first.refresh_token !== second.refresh_token, `${how}: ${first.status} ${second.status}, same: ${first.refresh_token === second.refresh_token}`);
      const wrong = await send(second.refresh_token, `${S.clientSecret}x`);
      assert(wrong.status === 401 && wrong.error === "invalid_client" && !wrong.access_token, `${how}, wrong secret: ${wrong.status} ${wrong.error}`);
      const rows = sql(`SELECT COUNT(*) AS n FROM refresh_once WHERE id IN (${[S.tokens.refresh_token, second.refresh_token].map((t) => q(rowId(t))).join(", ")}) OR id = ${q(lockId(second.refresh_token))}`);
      assert(rows[0].n === 0, `${how}: ${rows[0].n} rows`);
      said.push(`${how}: two different answers, the wrong secret 401, no rows`);
    }
    return said.join("; ");
  });

  await stage("a header the library doesn't count as client authentication (Bearer) still goes through the lock", async () => {
    const H = await connect("Refresh check H");
    const header = { Authorization: "Bearer not-a-client-credential" };
    const [one, two] = await Promise.all([refresh(H.tokens.refresh_token, H.clientId, {}, header), refresh(H.tokens.refresh_token, H.clientId, {}, header)]);
    assert(one.status === 200 && two.status === 200 && one.refresh_token === two.refresh_token, `${one.status} ${two.status}, same: ${one.refresh_token === two.refresh_token}`);
    assert(await works(one.refresh_token, H.clientId), "the answer doesn't refresh");
    return "two at once, one answer, and it refreshes";
  });

  await stage("the body is read once, up to 16 KiB: a bigger one is refused at once, declared or streamed", async () => {
    const big = new URLSearchParams({ grant_type: "refresh_token", refresh_token: C.tokens.refresh_token, client_id: C.clientId, padding: "x".repeat(20_000) }).toString();
    let started = Date.now();
    const declared = await fetch(`${BASE}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: big });
    const declaredMs = Date.now() - started;
    assert(declared.status === 400 && (await declared.json()).error === "invalid_request", `declared: ${declared.status}`);
    const bytes = new TextEncoder().encode(big);
    const stream = new ReadableStream({
      async pull(controller) {
        for (let at = 0; at < bytes.length; at += 4096) {
          controller.enqueue(bytes.slice(at, at + 4096));
          await sleep(20);
        }
        controller.close();
      },
    });
    started = Date.now();
    const streamed = await fetch(`${BASE}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: stream, duplex: "half" });
    const streamedMs = Date.now() - started;
    assert(streamed.status === 400 && (await streamed.json()).error === "invalid_request", `streamed: ${streamed.status}`);
    assert(declaredMs < 3_000 && streamedMs < 3_000, `took ${declaredMs} and ${streamedMs} ms`);
    return `400 in ${declaredMs} ms (declared) and ${streamedMs} ms (streamed)`;
  });

  let E;
  await stage("a kept answer moved to another token's row, or changed, is never served", async () => {
    E = await connect("Refresh check E");
    const r0 = E.tokens.refresh_token;
    const a0 = await refresh(r0, E.clientId); // row(R0) keeps R1
    const r1 = a0.refresh_token;
    const a1 = await refresh(r1, E.clientId); // row(R1) keeps R2
    const kept0 = sql(`SELECT body FROM refresh_once WHERE id = ${q(rowId(r0))}`)[0].body;
    sql(`UPDATE refresh_once SET body = ${q(kept0)} WHERE id = ${q(rowId(r1))}`);
    const moved = await refresh(r1, E.clientId); // with row(R0)'s answer: R1's key can't open it
    assert(moved.status === 200 && moved.refresh_token !== r1 && moved.refresh_token !== a1.refresh_token, `moved: ${moved.status} ${moved.refresh_token === r1 ? "(row R0's answer)" : ""}`);
    const r3 = moved.refresh_token; // the library rotated R1 again
    const a3 = await refresh(r3, E.clientId);
    const kept3 = JSON.parse(sql(`SELECT body FROM refresh_once WHERE id = ${q(rowId(r3))}`)[0].body);
    const flipped = kept3.sealed.slice(0, 10) + (kept3.sealed[10] === "A" ? "B" : "A") + kept3.sealed.slice(11);
    sql(`UPDATE refresh_once SET body = ${q(JSON.stringify({ ...kept3, sealed: flipped }))} WHERE id = ${q(rowId(r3))}`);
    const changed = await refresh(r3, E.clientId);
    assert(changed.status === 200 && changed.refresh_token !== a3.refresh_token, `changed: ${changed.status} ${changed.refresh_token === a3.refresh_token ? "(the kept answer)" : ""}`);
    return "both went to the library instead";
  });

  await stage("a lock row past its 60 s lease (written here, as a refresh that died leaves it) is taken over", async () => {
    const F = await connect("Refresh check F");
    const now = Date.now();
    sql(`INSERT INTO refresh_once (id, kind, user_id, body, expires_at) VALUES (${q(lockId(F.tokens.refresh_token))}, 'lock', ${q(accountId)}, ${q(JSON.stringify({ caller: "someone", lockedAt: now - 61_000 }))}, ${now - 1_000})`);
    const started = Date.now();
    const answer = await refresh(F.tokens.refresh_token, F.clientId);
    const took = Date.now() - started;
    assert(answer.status === 200, `refresh: ${answer.status} ${answer.error ?? ""}`);
    assert(took < 3_000, `took ${took} ms`);
    return `200 in ${took} ms`;
  });

  await stage("a held lock row (written here, as a refresh in progress holds it): another waits, is told to try again, and never refreshes beside it", async () => {
    const G = await connect("Refresh check G");
    const token = G.tokens.refresh_token;
    const now = Date.now();
    sql(`INSERT INTO refresh_once (id, kind, user_id, body, expires_at) VALUES (${q(lockId(token))}, 'lock', ${q(accountId)}, ${q(JSON.stringify({ caller: "another request", lockedAt: now }))}, ${now + 60_000})`);
    const started = Date.now();
    const answer = await refresh(token, G.clientId);
    const took = Date.now() - started;
    assert(answer.status === 503 && answer.error === "temporarily_unavailable" && answer.headers["retry-after"] === "1", `the repeat: ${answer.status} ${answer.error}`);
    assert(took >= 9_000 && took < 14_000, `took ${took} ms`);
    assert(grantOf(token).refreshTokenId === sha256(token), "the grant moved: something refreshed beside the lock");
    sql(`DELETE FROM refresh_once WHERE id = ${q(lockId(token))}`); // that refresh "finishes" without changing anything
    assert(await works(token, G.clientId), "the token no longer refreshes");
    return `503 temporarily_unavailable after ${took} ms; the grant still holds the token as current; then 200`;
  });

  await stage("what's kept in D1 is sealed: no token in it, not readable as text, found only by a hash, the account's", async () => {
    const rows = sql("SELECT id, body, kind, user_id FROM refresh_once");
    const answers = rows.filter((row) => row.kind === "answer");
    assert(answers.length > 0, "no kept answers");
    assert(rows.length === answers.length, `${rows.length - answers.length} locks left held`);
    for (const row of answers) {
      for (const token of seen) assert(!row.id.includes(token) && !row.body.includes(token), "a token in the clear");
      const kept = JSON.parse(row.body);
      assert(Object.keys(kept).sort().join() === "caller,iv,sealed" && /^[0-9a-f]{64}$/.test(kept.caller), `row: ${Object.keys(kept)}`);
      const sealed = Buffer.from(kept.sealed, "base64url");
      assert(!sealed.toString("latin1").includes("token") && !/^[\x20-\x7e]*$/.test(sealed.toString("latin1")), "the sealed answer reads as text");
      assert(Buffer.from(kept.iv, "base64url").length === 12, "iv");
      assert(row.user_id === accountId, `user_id ${row.user_id}`); // every app here is connected to this account
    }
    return `${answers.length} kept answers and no held locks; ${seen.size} tokens looked for`;
  });

  await stage("a passkey sign-in sent another row's id as its challenge cookie deletes nothing it didn't look for", async () => {
    const id = `refresh-check-${RUN}`;
    sql(`INSERT INTO challenges (id, challenge, kind, user_id, user_name, expires_at) VALUES (${q(id)}, 'x', 'oauth', NULL, NULL, ${Date.now() + 600_000})`);
    const verify = await fetch(`${BASE}/api/auth/login/verify`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, Cookie: `lc_chal=${id}` }, body: JSON.stringify({ id: "x", response: {} }) });
    const left = sql(`SELECT COUNT(*) AS n FROM challenges WHERE id = ${q(id)}`)[0].n;
    sql(`DELETE FROM challenges WHERE id = ${q(id)}`);
    assert(verify.status >= 400 && left === 1, `verify ${verify.status}; the other row ${left ? "kept" : "deleted"}`);
    return `verify ${verify.status}; the 'oauth' row kept`;
  });

  await stage("deleting the account takes its rows, and a token that worked a moment before stops working", async () => {
    const K = await connect("Refresh check K");
    const current = (await refresh(K.tokens.refresh_token, K.clientId)).refresh_token;
    assert(current && grantOf(current).refreshTokenId === sha256(current), "no current token to try");
    const response = await go(`${BASE}/api/me`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) });
    assert(response.status === 200, `delete: ${response.status}`);
    const rows = sql(`SELECT COUNT(*) AS n FROM refresh_once WHERE user_id = ${q(accountId)}`);
    accountId = null;
    assert(rows[0].n === 0, `${rows[0].n} rows left`);
    const after = await refresh(current, K.clientId);
    assert(after.status === 400 && !after.access_token, `refresh after delete: ${after.status}`);
    return `no rows left; the current token ${after.status} ${after.error}`;
  });
}

// ---------- done ----------

if (accountId) await go(`${BASE}/api/me`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) });
standin.kill();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, reproduce: REPRODUCE, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} stages passed`);
process.exit(failed.length ? 1 : 0);
