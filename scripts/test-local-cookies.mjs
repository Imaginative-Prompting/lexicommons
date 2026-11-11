// A local copy's cookies over plain http (src/util.ts localHttpCookies, withLocalCookies; src/index.ts hands every answer through it).
// Safari and every WebKit browser drop a Secure cookie that http://localhost sets, so a copy's passkey sign-up never got its challenge back.
// The rule: the live config keeps Secure on every cookie, whatever address a request comes to (wrangler.jsonc as it deploys, read here); a
// copy (its PUBLIC_ORIGIN http://localhost:<port> or http://127.0.0.1:<port>, as scripts/local.mjs sets it) takes Secure off each cookie only
// for a request over plain http to localhost or 127.0.0.1, and changes nothing else. Each rule refuses a planted wrong one first.
// `node scripts/test-local-cookies.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { workerEnv } from "./fixtures/worker-env.mjs";

workerEnv(); // the TypeScript loader
const util = await import("../src/util.ts");
const { cookieHeader, clearCookieHeader, localHttpCookies, withLocalCookies, localCookieRequest, LOCAL_HOST_PREFIX } = util;
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const test = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`  ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 4).join("\n        ")}`);
  }
};
// A rule must refuse the planted wrong one before its pass means anything.
const refuses = async (rule, plant, what) => {
  let threw = false;
  try {
    await rule(plant);
  } catch {
    threw = true;
  }
  assert(threw, `the rule passed a planted ${what}`);
};

// wrangler.jsonc as it deploys (TypeScript's reader takes its comments and trailing commas).
const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", readFileSync(join(APP, "wrangler.jsonc"), "utf8"));
assert(!parsed.error, `wrangler.jsonc doesn't read: ${parsed.error && ts.flattenDiagnosticMessageText(parsed.error.messageText, " ")}`);
const config = parsed.config;
// Its top level and every environment it names: each a way the site can deploy.
const deploys = [["the top level", config.vars ?? {}], ...Object.entries(config.env ?? {}).map(([name, e]) => [`env.${name}`, e.vars ?? {}])];
// A copy's origin, as scripts/local.mjs builds it.
const localSource = readFileSync(join(APP, "scripts/local.mjs"), "utf8");
assert(/const origin = `http:\/\/localhost:\$\{port\}`/.test(localSource), "scripts/local.mjs no longer builds its origin as http://localhost:<port>: read it again here");
const COPY = "http://localhost:8937";

// Every cookie the server makes, set and cleared (the names as src/ has them; the values made up).
const NAMES = ["lc_session", "lc_chal", "lc_gate", "lc_pending", "lc_oauth", "lc_preview"];
{
  const inSrc = new Set();
  for (const file of (await import("node:fs")).readdirSync(join(APP, "src")).filter((f) => f.endsWith(".ts"))) {
    for (const m of readFileSync(join(APP, "src", file), "utf8").matchAll(/_COOKIE = "([^"]+)"/g)) inSrc.add(m[1]);
  }
  assert.deepEqual([...inSrc].sort(), [...NAMES].sort(), "the cookies src/ defines changed: list them here");
}
// And the OAuth library's (workers-oauth-provider): __Host- cookies, set and cleared as it writes them (its oauth-provider.js setCookie, clearCookie).
const HOST_COOKIES = ["__Host-oauth-tx-0123456789abcdef=bound; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600", "__Host-oauth-tx-0123456789abcdef=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"];
const COOKIES = [...NAMES.flatMap((name) => [cookieHeader(name, `${name}-value Secure; x`, 3600), clearCookieHeader(name)]), ...HOST_COOKIES];
const answer = (status = 200) => {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", "X-Kept": "1" });
  for (const cookie of COOKIES) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify({ ok: true }), { status, headers });
};
const secure = (cookie) => cookie.split(";").slice(1).some((part) => part.trim().toLowerCase() === "secure");
// Every place a request can come to, the live site's own first.
const REQUESTS = ["https://lexicommons.com/api/auth/register/options", "https://lexicommons.com/app/", "http://lexicommons.com/login", "https://lexicommons.app/", "http://localhost:8787/api/auth/register/options", "http://127.0.0.1:8787/app/", "https://localhost:8937/app/", "http://localhost:8937/app/"];

await test("every cookie the server makes is Secure, HttpOnly and SameSite=Lax", () => {
  assert.equal(COOKIES.length, NAMES.length * 2 + HOST_COOKIES.length);
  for (const cookie of COOKIES) assert(secure(cookie) && /; HttpOnly;/.test(cookie) && /; SameSite=Lax;/.test(cookie), cookie);
  return `${COOKIES.length} cookies`;
});

// The live config: Secure on every cookie, whatever the request's address (a dev server on the main config answers http://localhost too).
const liveRule = async (fn) => {
  assert(deploys.length >= 1);
  for (const [where, vars] of deploys) {
    assert.match(String(vars.PUBLIC_ORIGIN ?? ""), /^https:\/\//, `${where}'s PUBLIC_ORIGIN isn't https: ${vars.PUBLIC_ORIGIN}`);
    for (const url of REQUESTS) {
      assert.equal(fn.localHttpCookies(vars.PUBLIC_ORIGIN, url), false, `${where}: ${url} counted as a local copy's`);
      const given = answer();
      const out = fn.withLocalCookies(given, vars.PUBLIC_ORIGIN, url);
      assert.equal(out, given, `${where}: ${url}: the answer wasn't handed back as it was`);
      const cookies = out.headers.getSetCookie();
      assert.equal(cookies.length, COOKIES.length, `${where}: ${url}: ${cookies.length} cookies`);
      for (const cookie of cookies) assert(secure(cookie), `${where}: ${url}: not Secure: ${cookie}`);
      assert.deepEqual(cookies, COOKIES, `${where}: ${url}: a cookie changed`);
    }
  }
};
await test("the live config (wrangler.jsonc, every deploy it names) sets Secure on every cookie, for a request to any address", async () => {
  await refuses(liveRule, { localHttpCookies: () => true, withLocalCookies: (r) => withLocalCookies(r, COPY, "http://localhost:8937/") }, "rule that strips Secure everywhere");
  await refuses(liveRule, { localHttpCookies: (_o, url) => new URL(url).hostname === "localhost", withLocalCookies: (r, _o, url) => withLocalCookies(r, COPY, url.replace(":8787", ":8937")) }, "rule that reads only the request's address");
  await liveRule(util);
  return `${deploys.map(([w, v]) => `${w} ${v.PUBLIC_ORIGIN}`).join("; ")}, ${REQUESTS.length} addresses`;
});

// A copy over plain http: Secure off each cookie, nothing else changed.
const copyRule = async (fn) => {
  for (const [origin, url] of [[COPY, `${COPY}/api/auth/register/options`], [COPY, "http://127.0.0.1:8937/app/"], ["http://127.0.0.1:8937", "http://127.0.0.1:8937/login"]]) {
    assert.equal(fn.localHttpCookies(origin, url), true, `${origin}: ${url} not counted as a copy's`);
    const out = fn.withLocalCookies(answer(201), origin, url);
    const cookies = out.headers.getSetCookie();
    assert.equal(cookies.length, COOKIES.length, `${url}: ${cookies.length} cookies`);
    cookies.forEach((cookie, i) => {
      assert(!secure(cookie), `${url}: still Secure: ${cookie}`);
      // A browser drops a __Host- cookie that isn't Secure (Chrome did: connecting an AI to a copy always failed), so one goes out renamed.
      assert(!cookie.startsWith("__Host-"), `${url}: a __Host- cookie without Secure, which a browser drops: ${cookie}`);
      const plain = COOKIES[i].split(";").filter((part, n) => n === 0 || part.trim() !== "Secure").join(";");
      const want = plain.startsWith("__Host-") ? LOCAL_HOST_PREFIX + plain.slice("__Host-".length) : plain;
      assert.equal(cookie, want, `${url}: more than Secure (and a __Host- name) changed`);
    });
    assert.equal(out.status, 201);
    assert.equal(out.headers.get("X-Kept"), "1");
    assert.equal(out.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await out.json(), { ok: true });
  }
};
await test("a copy (http://localhost:<port>, as npm run local serves it) takes Secure off each cookie for a plain-http request, nothing else", async () => {
  await refuses(copyRule, { localHttpCookies: () => true, withLocalCookies: (r) => r }, "rule that changes nothing");
  // The rule from before: Secure off every cookie, a __Host- one's name kept, so Chrome drops it.
  const before = (r) => { const h = new Headers(r.headers); h.delete("Set-Cookie"); for (const c of r.headers.getSetCookie()) h.append("Set-Cookie", c.split(";").filter((part, i) => i === 0 || part.trim().toLowerCase() !== "secure").join(";")); return new Response(r.body, { status: r.status, headers: h }); };
  await refuses(copyRule, { localHttpCookies: () => true, withLocalCookies: before }, "rule that keeps a __Host- name with Secure off (the one from before)");
  await refuses(copyRule, { localHttpCookies: () => true, withLocalCookies: (r) => { const h = new Headers(r.headers); h.delete("Set-Cookie"); return new Response(r.body, { status: r.status, headers: h }); } }, "rule that drops the cookies");
  await copyRule(util);
  return `${COOKIES.length} cookies each (the OAuth library's ${HOST_COOKIES.length} renamed ${LOCAL_HOST_PREFIX}…), at localhost and 127.0.0.1`;
});

await test("a copy keeps Secure for an https request, another address, or an origin that only starts like localhost", () => {
  const cases = [
    [COPY, "https://localhost:8937/app/"],
    [COPY, "http://example.com/app/"],
    [COPY, "http://localhost.example.com:8937/app/"],
    ["http://localhost.example.com", "http://localhost.example.com/app/"],
    ["http://localhost:8937/", "http://localhost:8937/app/"],
    ["https://localhost:8937", "https://localhost:8937/app/"],
    ["", "http://localhost:8937/app/"],
    [undefined, "http://localhost:8937/app/"],
  ];
  for (const [origin, url] of cases) {
    assert.equal(localHttpCookies(origin, url), false, `${origin} / ${url}`);
    for (const cookie of withLocalCookies(answer(), origin, url).headers.getSetCookie()) assert(secure(cookie), `${origin} / ${url}: ${cookie}`);
  }
  return `${cases.length} cases`;
});

await test("an answer with no cookies, or a WebSocket's, is handed back as it is", () => {
  const plain = new Response("x", { headers: { "X-Kept": "1" } });
  assert.equal(withLocalCookies(plain, COPY, `${COPY}/app/`), plain);
  const upgrade = { status: 101, headers: new Headers({ "Set-Cookie": cookieHeader("lc_session", "v", 60) }) };
  assert.equal(withLocalCookies(upgrade, COPY, `${COPY}/mcp`), upgrade);
});

// A copy's renamed cookies come back in under their own names, so the OAuth library reads its binding cookie; nothing else changes.
const requestRule = async (fn) => {
  for (const [origin, url] of [[COPY, `${COPY}/authorize`], ["http://127.0.0.1:8937", "http://127.0.0.1:8937/authorize"]]) {
    const given = new Request(url, { method: "POST", headers: { Cookie: `lc_session=a; ${LOCAL_HOST_PREFIX}oauth-tx-0123456789abcdef=bound; other=x`, "Content-Type": "application/x-www-form-urlencoded", "X-Kept": "1" }, body: "decision=approve&handle=h" });
    const read = fn.localCookieRequest(given, origin);
    assert.equal(read.headers.get("Cookie"), "lc_session=a; __Host-oauth-tx-0123456789abcdef=bound; other=x", `${url}: ${read.headers.get("Cookie")}`);
    assert.equal(read.headers.get("X-Kept"), "1");
    assert.equal(read.method, "POST");
    assert.equal(await read.text(), "decision=approve&handle=h", `${url}: the body didn't come through`);
  }
  // A request with none of them, and every request to a site that isn't a copy over plain http: the same object.
  const none = new Request(`${COPY}/app/`, { headers: { Cookie: "lc_session=a" } });
  assert.equal(fn.localCookieRequest(none, COPY), none);
  for (const [, vars] of deploys) {
    for (const url of REQUESTS) {
      const given = new Request(url, { headers: { Cookie: `${LOCAL_HOST_PREFIX}oauth-tx-01=bound` } });
      assert.equal(fn.localCookieRequest(given, vars.PUBLIC_ORIGIN), given, `${url}: a request to the live config changed`);
    }
  }
};
await test("a copy's renamed __Host- cookies come back in under their own names (the OAuth library's binding cookie); the live config's requests are as they came", async () => {
  await refuses(requestRule, { localCookieRequest: (r) => r }, "rule that renames nothing back");
  await refuses(requestRule, { localCookieRequest: (r, o) => (localHttpCookies(o, r.url) ? new Request(r.url, { method: r.method, headers: { Cookie: (r.headers.get("Cookie") ?? "").replaceAll(LOCAL_HOST_PREFIX, "__Host-") } }) : r) }, "rule that loses the request's body and headers");
  await requestRule(util);
  return "localhost and 127.0.0.1, a POST's body kept";
});

await test("the Worker hands every answer through withLocalCookies, with its deploy's PUBLIC_ORIGIN and the request's address", () => {
  const index = readFileSync(join(APP, "src/index.ts"), "utf8");
  const fetchAt = index.indexOf("async fetch(request: Request, deployEnv: Env, ctx: ExecutionContext)");
  assert(fetchAt > 0, "src/index.ts has no fetch handler of that shape");
  const body = index.slice(fetchAt, index.indexOf("\n  },", fetchAt));
  assert.match(body, /return withLocalCookies\(await serve\(localCookieRequest\(request, deployEnv\.PUBLIC_ORIGIN\), deployEnv, ctx\), deployEnv\.PUBLIC_ORIGIN, request\.url\);/, `fetch: ${body}`);
  assert.equal((index.match(/withLocalCookies\(/g) ?? []).length, 1, "withLocalCookies called more than once");
});

console.log(failed ? `local cookies: ${failed} FAILED` : "local cookies: all passed");
process.exit(failed ? 1 : 0);
