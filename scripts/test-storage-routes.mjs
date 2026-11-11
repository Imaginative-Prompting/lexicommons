// The routes that add a client secret to a storage sign-in (src/storage.ts): Google's two, and OneDrive's two once its secret is set. A
// body read only up to its limit, each field only as text of a sane length, so nothing huge or odd goes on (6 Nov 2026, Codex C16); a right
// one goes, with the secret added (the control). OneDrive's: refused with nothing sent while the site has no secret (the app is on the
// single-page way then), the config saying which way and never the secret; Microsoft's answer passed back with only what the app needs;
// a sign-in that ended (invalid_grant) told apart from a refusal that's the site's (invalid_client, Microsoft down: 502, counted in the
// error reports); the secret in no answer, no report and nowhere but the request to Microsoft, even when Microsoft's words carry it; the
// stand-in's address used only on localhost. Google and Microsoft played in memory, D1 on the real migrations.
// `node scripts/test-storage-routes.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env: worker, rows } = workerEnv(); // the TypeScript loader, and D1 for the error reports
const { Hono } = await import("hono");
const { storage } = await import("../src/storage.ts");

const SECRET = "the-onedrive-secret~with.odd_chars";
const MICROSOFT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const sent = [];
// What the next call to Microsoft answers: a Response, or a function of the request (throw for "unreachable").
let microsoft = null;
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: String(init?.body ?? ""), headers: init?.headers ?? {} });
  if (String(url).startsWith("https://oauth2.googleapis.com/")) return Response.json({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "s" });
  const answer = microsoft ?? (() => Response.json({ access_token: "ms-at", refresh_token: "ms-rt-2", expires_in: 3600, scope: "Files.ReadWrite.AppFolder", id_token: "not-for-the-app", token_type: "Bearer" }));
  return typeof answer === "function" ? answer(url, init) : answer.clone();
};
const limiter = { limit: async () => ({ success: true }) };
const google = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "the-secret", STORAGE_REDIRECT_URI: "https://x.example/app/storage/callback" };
const base = { ...google, DB: worker.DB, AUTH_LIMITER: limiter, PUBLIC_ORIGIN: "https://x.example", ONEDRIVE_CLIENT_ID: "ms-client" };
const withSecret = { ...base, ONEDRIVE_CLIENT_SECRET: SECRET };
// As app.ts mounts it: a signed-in person (the session middleware's user) in front, or no one.
const appFor = (signedIn) => {
  const app = new Hono();
  app.use("*", async (c, next) => (signedIn && c.set("user", { id: "u" }), next()));
  app.route("/api/storage", storage);
  return app;
};
const app = appFor(true);
const post = (path, body, env = withSecret, to = app) =>
  to.request(`/api/storage${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }, env);
const reports = () => rows("SELECT message, place, stack FROM error_groups WHERE place LIKE '%onedrive%'");

let failed = 0;
const test = async (name, fn) => {
  microsoft = null;
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
};

// ---------- Google ----------

await test("Google: a huge body, a huge or odd field, or no JSON: refused, and nothing goes to Google", async () => {
  const before = sent.length;
  for (const [path, body] of [["/google/refresh", { refreshToken: "x".repeat(5_000_000) }], ["/google/refresh", { refreshToken: "x".repeat(5000) }], ["/google/token", { code: { toString: null }, codeVerifier: "v" }], ["/google/token", { code: ["a"], codeVerifier: "v" }], ["/google/refresh", "not json"]]) {
    const r = await post(path, body, base);
    assert.equal(r.status, 400, `${path} ${String(JSON.stringify(body)).slice(0, 60)}: ${r.status}`);
  }
  assert.equal(sent.length, before, "something went to Google");
});
await test("Google: a field of 4,096 goes, of 4,097 doesn't (its limit unchanged)", async () => {
  assert.equal((await post("/google/refresh", { refreshToken: "r".repeat(4096) }, base)).status, 200);
  const before = sent.length;
  assert.equal((await post("/google/refresh", { refreshToken: "r".repeat(4097) }, base)).status, 400);
  assert.equal(sent.length, before);
});
await test("Google: a right refresh and a right code go on, with the secret added (the control)", async () => {
  assert.equal((await post("/google/refresh", { refreshToken: "1//real-looking-token" }, base)).status, 200);
  assert.equal((await post("/google/token", { code: "4/0Abc", codeVerifier: "v".repeat(64) }, base)).status, 200);
  assert.ok(sent.at(-2).body.includes("client_secret=the-secret") && sent.at(-2).body.includes("refresh_token=1%2F%2Freal-looking-token"));
});

// ---------- OneDrive: which way, and never the secret ----------

const config = async (env) => (await appFor(true).request("/api/storage/config", {}, env)).text();
await test("the config: without the secret OneDrive is the single-page app's (no redirect of its own), with it the server's and its Web redirect", async () => {
  const without = JSON.parse(await config(base));
  assert.deepEqual(without.onedrive, { clientId: "ms-client", scope: "Files.ReadWrite.AppFolder offline_access", via: "browser" });
  const withIt = JSON.parse(await config(withSecret));
  assert.deepEqual(withIt.onedrive, { clientId: "ms-client", scope: "Files.ReadWrite.AppFolder offline_access", via: "server", redirectUri: "https://x.example/app/storage/onedrive" });
  assert.equal(withIt.redirectUri, "https://x.example/app/storage/callback", "the single-page redirect stays for Google, Dropbox and the way without the secret");
  // A secret with no client id offers nothing (a copy with OneDrive switched off).
  assert.equal(JSON.parse(await config({ ...withSecret, ONEDRIVE_CLIENT_ID: "" })).onedrive.via, "browser");
});
await test("the config never carries a secret", async () => {
  for (const env of [base, withSecret]) {
    const text = await config(env);
    assert.ok(!text.includes(SECRET) && !text.includes("the-secret"), text);
  }
});
await test("signed out: OneDrive's routes are 401 and nothing goes to Microsoft", async () => {
  const before = sent.length;
  for (const path of ["/onedrive/token", "/onedrive/refresh"]) {
    const r = await post(path, { code: "c", codeVerifier: "v", refreshToken: "r" }, withSecret, appFor(false));
    assert.equal(r.status, 401, `${path}: ${r.status}`);
  }
  assert.equal(sent.length, before);
});
await test("without the secret: OneDrive's routes are refused (not_offered), a right body included, and nothing goes to Microsoft", async () => {
  const before = sent.length;
  for (const [path, body] of [["/onedrive/token", { code: "M.C5_BAY.2.U.real-looking", codeVerifier: "v".repeat(64) }], ["/onedrive/refresh", { refreshToken: "M.C5_BAY.0.U.-real-looking" }]]) {
    const r = await post(path, body, base);
    assert.equal(r.status, 404, `${path}: ${r.status}`);
    assert.equal((await r.json()).error, "not_offered");
  }
  assert.equal(sent.length, before, "something went to Microsoft");
});

// ---------- OneDrive: what the routes take ----------

await test("a huge body, a huge or odd field, a missing one, or no JSON: refused, and nothing goes to Microsoft", async () => {
  const before = sent.length;
  const cases = [
    ["/onedrive/refresh", { refreshToken: "x".repeat(5_000_000) }],
    ["/onedrive/refresh", { refreshToken: "x".repeat(8193) }],
    ["/onedrive/token", { code: "c".repeat(8193), codeVerifier: "v".repeat(64) }],
    ["/onedrive/token", { code: { toString: null }, codeVerifier: "v" }],
    ["/onedrive/token", { code: ["a"], codeVerifier: "v" }],
    ["/onedrive/token", { code: "c" }],
    ["/onedrive/token", { codeVerifier: "v" }],
    ["/onedrive/refresh", {}],
    ["/onedrive/refresh", [{ refreshToken: "r" }]],
    ["/onedrive/refresh", "not json"],
  ];
  for (const [path, body] of cases) {
    const r = await post(path, body);
    assert.equal(r.status, 400, `${path} ${String(JSON.stringify(body)).slice(0, 60)}: ${r.status}`);
  }
  assert.equal(sent.length, before, "something went to Microsoft");
});
await test("a field of 8,192 goes (Microsoft's codes and tokens have no documented length), of 8,193 doesn't", async () => {
  assert.equal((await post("/onedrive/refresh", { refreshToken: "r".repeat(8192) })).status, 200);
  const before = sent.length;
  assert.equal((await post("/onedrive/refresh", { refreshToken: "r".repeat(8193) })).status, 400);
  assert.equal(sent.length, before);
});

// ---------- OneDrive: what goes to Microsoft, and what comes back ----------

const form = (request) => Object.fromEntries(new URLSearchParams(request.body));
await test("a right code goes to Microsoft with the secret, the Web redirect, the verifier and the scope; only what the app needs comes back (the control)", async () => {
  const r = await post("/onedrive/token", { code: "M.C5_BAY.2.U.code", codeVerifier: "v".repeat(64) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await r.json(), { accessToken: "ms-at", refreshToken: "ms-rt-2", expiresIn: 3600, scope: "Files.ReadWrite.AppFolder" });
  const request = sent.at(-1);
  assert.equal(request.url, MICROSOFT);
  assert.deepEqual(form(request), {
    grant_type: "authorization_code",
    code: "M.C5_BAY.2.U.code",
    code_verifier: "v".repeat(64),
    redirect_uri: "https://x.example/app/storage/onedrive",
    client_id: "ms-client",
    client_secret: SECRET,
    scope: "Files.ReadWrite.AppFolder offline_access",
  });
  assert.ok(!("Origin" in request.headers), "a web app's redemption carries no Origin (Microsoft refuses one: AADSTS9002326)");
});
await test("a right refresh goes with the secret, and Microsoft's new refresh token comes back (it replaces itself on every use)", async () => {
  const r = await post("/onedrive/refresh", { refreshToken: "M.C5_BAY.0.U.-old" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).refreshToken, "ms-rt-2");
  assert.deepEqual(form(sent.at(-1)), { grant_type: "refresh_token", refresh_token: "M.C5_BAY.0.U.-old", client_id: "ms-client", client_secret: SECRET, scope: "Files.ReadWrite.AppFolder offline_access" });
});
await test("a sign-in that ended: Microsoft's invalid_grant comes back as it is (400), and isn't counted as the site's", async () => {
  const before = reports().length;
  microsoft = Response.json({ error: "invalid_grant", error_description: "AADSTS70000: The provided grant has expired due to it being revoked." }, { status: 400 });
  const r = await post("/onedrive/refresh", { refreshToken: "M.C5_BAY.0.U.-old" });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.error, "invalid_grant");
  assert.match(body.detail, /^AADSTS70000/);
  assert.equal(reports().length, before, "counted");
});
await test("the secret refused (invalid_client: wrong or expired): 502, never a sign-in to renew, counted with a fixed message", async () => {
  microsoft = Response.json({ error: "invalid_client", error_description: `AADSTS7000222: The provided client secret keys for app 'ms-client' are expired. ${SECRET}` }, { status: 401 });
  const r = await post("/onedrive/refresh", { refreshToken: "M.C5_BAY.0.U.-old" });
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: "onedrive_unavailable" });
  const counted = reports().find((g) => /refresh: Microsoft answered 401 invalid_client/.test(g.message));
  assert.ok(counted, JSON.stringify(reports()));
  assert.equal(counted.place, "POST /api/storage/onedrive/refresh");
});
await test("Microsoft unreachable, down, throttling, or answering with no token: 502, counted", async () => {
  const cases = [
    ["unreachable", () => { throw new TypeError("fetch failed"); }],
    ["answered 503", Response.json({ error: "temporarily_unavailable" }, { status: 503 })],
    ["answered 429", new Response("slow down", { status: 429 })],
    ["with no token", Response.json({ token_type: "Bearer" })],
  ];
  for (const [why, answer] of cases) {
    microsoft = answer;
    const r = await post("/onedrive/token", { code: "c", codeVerifier: "v".repeat(43) });
    assert.equal(r.status, 502, `${why}: ${r.status}`);
    assert.ok(reports().some((g) => g.message.includes(`code exchange: Microsoft`) && g.message.includes(why === "unreachable" ? "unreachable" : why)), `${why} not counted`);
  }
});
await test("any other refusal (a redirect the registration lacks): passed back as 400 and counted, since connecting again won't fix it", async () => {
  microsoft = Response.json({ error: "invalid_request", error_description: "AADSTS50011: The redirect URI specified in the request does not match." }, { status: 400 });
  const r = await post("/onedrive/token", { code: "c", codeVerifier: "v".repeat(43) });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "invalid_request");
  assert.ok(reports().some((g) => /code exchange: Microsoft refused it, 400 invalid_request/.test(g.message)));
});
await test("Microsoft's words carrying the secret: it's taken out of what comes back; an odd error code becomes our own word", async () => {
  microsoft = Response.json({ error: "invalid_request", error_description: `It said ${SECRET} twice: ${SECRET}.` }, { status: 400 });
  const body = await (await post("/onedrive/token", { code: "c", codeVerifier: "v".repeat(43) })).text();
  assert.ok(!body.includes(SECRET), body);
  assert.match(body, /It said … twice: …\./);
  microsoft = Response.json({ error: `<b>${SECRET}</b>` }, { status: 400 });
  const odd = await (await post("/onedrive/refresh", { refreshToken: "r" })).json();
  assert.equal(odd.error, "token_error");
});
await test("the secret in no error report, ever", async () => {
  const all = JSON.stringify(rows("SELECT * FROM error_groups"));
  assert.ok(reports().length >= 5, `only ${reports().length} reports`);
  assert.ok(!all.includes(SECRET) && !all.includes("the-onedrive-secret"), all.slice(0, 400));
});
await test("the stand-in's address is used only when this server and it are both on localhost", async () => {
  await post("/onedrive/refresh", { refreshToken: "r" }, { ...withSecret, PUBLIC_ORIGIN: "https://lexicommons.com", AUTH_STANDIN: "http://localhost:9999" });
  assert.equal(sent.at(-1).url, MICROSOFT, "a deployed site sent its secret to a stand-in");
  await post("/onedrive/refresh", { refreshToken: "r" }, { ...withSecret, PUBLIC_ORIGIN: "http://localhost:8800", AUTH_STANDIN: "http://evil.example:9999" });
  assert.equal(sent.at(-1).url, MICROSOFT);
  await post("/onedrive/refresh", { refreshToken: "r" }, { ...withSecret, PUBLIC_ORIGIN: "http://localhost:8800", AUTH_STANDIN: "http://localhost:9999" });
  assert.equal(sent.at(-1).url, "http://localhost:9999/microsoft/token", "the control: a local check's stand-in");
});
await test("the secret went nowhere but Microsoft's token endpoint (and a local stand-in)", async () => {
  const carrying = sent.filter((r) => form(r).client_secret === SECRET || r.body.includes(SECRET));
  assert.ok(carrying.length >= 5, `only ${carrying.length}`);
  assert.deepEqual([...new Set(carrying.map((r) => r.url))].sort(), ["http://localhost:9999/microsoft/token", MICROSOFT]);
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
