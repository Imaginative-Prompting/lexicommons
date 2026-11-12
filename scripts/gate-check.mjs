#!/usr/bin/env node
// The site's going public, as one switch (src/gate.ts), on a local server started in the state it says:
//
//   gated    GATE_ENABLED true: everything behind the password but what's on the bypass list; nothing for search or for card
//            fetchers; the right password opens it, and a cookie from before the switch still does (--cookie-file).
//   pages    GATE_ENABLED true, GATE_PUBLIC_PAGES true: exactly the home page, the privacy policy and the terms open (and the
//            pricing page with --plan), for reading only and still out of search; nothing they link to, and no other spelling of them.
//   public   GATE_ENABLED false: every route the code has, walked with no account against private data it writes first. Only the
//            ones on OPEN answer, and nothing private comes back. Search and card fetchers get the three public pages, and the
//            share card; nothing else is theirs. The cookie table is what the code sets. Every page a visitor can reach loads only
//            from this site, in Chrome.
//
// Routes are read from the code, so a new one can't be missed: it fails here until it answers an account's refusal or goes on OPEN.
//
// --plan: the server offers the plan (PLAN_ENABLED and Stripe's vars, fake ones will do), so /pricing is a public page. Without it,
// /pricing doesn't exist: no spelling of it answers with the page, open or gated.
//
//   node scripts/gate-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --state gated|pages|public [--plan]
//        [--password <it>] [--cookie-file <file>] [--sharing everyone|admins]
//   node scripts/gate-check.mjs https://lexicommons.com <outDir> --state public --live
//        the live site once it's public, READ ONLY: only the stages that ask and never write (robots.txt, what may be indexed, no
//        pricing page, the public pages' words, the share card, the gate gone, the cookie table, redirects, the visitor's walk in Chrome).
//        No account is made and nothing is sent but GETs (and one wrong-password POST to the gate's old address); the stages that
//        write first, or read this copy's own files, say they were skipped (launch-day-site.md, 7 Nov 2026).
//
// LOCAL only, without --live: it writes accounts into the server's D1. Start the server with --var GATE_ENABLED:… --var GATE_PUBLIC_PAGES:…, and
// for a gated state --var GATE_PASSWORD:… --var GATE_SESSION_SECRET:…. Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planWordsIn, readable } from "./fixtures/plan-words.mjs";
import core from "../public/js/i18n/en/core.js";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const STATE = opt("state");
const PASSWORD = opt("password");
const COOKIE_FILE = opt("cookie-file") && resolve(opt("cookie-file"));
const SHARING = opt("sharing") ?? "everyone";
const PLAN = argv.includes("--plan");
const LIVE = argv.includes("--live");
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usable = LIVE
  ? /^https?:\/\/[^/]+$/.test(BASE ?? "") && OUT && STATE === "public" && !PERSIST
  : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") && OUT && PERSIST && ["gated", "pages", "public"].includes(STATE);
if (!usable) {
  console.error("Usage: node scripts/gate-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --state gated|pages|public (a local server only)");
  console.error("   or: node scripts/gate-check.mjs https://lexicommons.com <outDir> --state public --live (read only; no --persist-to)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

/** A request exactly as written (no URL clean-up, which would hide what a crafted path does). */
function raw(method, path, { headers = {}, body } = {}) {
  const { hostname, port, host, protocol } = new URL(BASE);
  return new Promise((done, fail) => {
    const request = (protocol === "https:" ? https : http).request({ hostname, port: port || undefined, method, path, headers: { Host: host, Connection: "close", ...headers, ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}) } }, (response) => {
      const chunks = [];
      response.on("data", (c) => chunks.push(c));
      response.on("end", () => done({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString("utf8"), bytes: Buffer.concat(chunks) }));
    });
    request.on("error", fail);
    request.setTimeout(30_000, () => request.destroy(new Error(`${method} ${path}: timed out`)));
    if (body) request.write(body);
    request.end();
  });
}

// ---------- every route the code has ----------

function routesInCode() {
  // Every router in src/, and where it's mounted, so a new router's routes are walked as well.
  const sources = readdirSync(join(APP, "src")).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join(APP, "src", f), "utf8"));
  const all = sources.join("\n");
  const routers = new Set([...all.matchAll(/\b(\w+)\s*=\s*new Hono\b/g)].map((m) => m[1]));
  const mounted = [...all.matchAll(/\b(\w+)\.route\("([^"]*)",\s*(\w+)\)/g)].map((m) => ({ parent: m[1], at: m[2], child: m[3] }));
  const prefix = (name) => {
    if (name === "app") return "";
    const mount = mounted.find((m) => m.child === name);
    assert(mount, `the router "${name}" is mounted nowhere this check can see`);
    return `${prefix(mount.parent)}${mount.at}`;
  };
  const found = [];
  for (const name of routers) {
    const at = prefix(name);
    for (const m of all.matchAll(new RegExp(`\\b${name}\\.(get|post|put|patch|delete|all)\\(\\s*"([^"]*)"`, "g"))) found.push({ method: m[1].toUpperCase(), path: `${at}${m[2] === "/" ? "" : m[2]}` || "/" });
  }
  // The OAuth provider's own (src/index.ts), which never reach the router.
  return [...found, ...[["POST", "/token"], ["POST", "/register"], ["GET", "/.well-known/oauth-authorization-server"], ["GET", "/.well-known/oauth-protected-resource/mcp"], ["POST", "/mcp"]].map(([method, path]) => ({ method, path }))];
}
const ROUTES = routesInCode();

// What may answer someone with no account, and how. Everything else in the code must refuse them.
const OPEN = {
  "GET /robots.txt": [200],
  // Stripe's webhook: refused without its signature (400), or 404 where the plan isn't offered.
  "POST /api/billing/stripe": [400, 404],
  "GET /privacy": [200],
  "GET /terms": [200],
  "GET /login": [200],
  "GET /app/": [302], // to sign-in
  "ALL *": [200, 301, 302, 303, 304, 307, 308, 400, 404, 405], // the static files
  "GET /library/*": [200, 400, 404],
  // Public by nature: the push key, Explore's topic names, OAuth's metadata.
  "GET /api/push/key": [200],
  "GET /api/community/topics": [200],
  // Error reports (src/errors.ts): taken from anyone the gate lets through, since they're cleaned and carry no account; always 204.
  "POST /api/errors": [204],
  // Report a bug (src/bug-reports.ts): for someone who can't sign in too, so the page and the report answer with no account (a report a form
  // from this site, else refused in words; a few a minute a connection, a day's worth of signed-out reports in all).
  "GET /report": [200],
  // The page with a slash after it goes to the page (src/app.ts), as /privacy/ does.
  "GET /login/": [301],
  "GET /report/": [301],
  "POST /api/bug-reports": [200, 400, 403, 429],
  "GET /.well-known/oauth-authorization-server": [200],
  "GET /.well-known/oauth-protected-resource/mcp": [200],
  // Signing in and making an account: that's who these are for. Each answers without a session or refuses a bad body.
  "POST /api/auth/register/options": [200, 400, 429],
  "POST /api/auth/register/verify": [400, 401, 429],
  "POST /api/auth/login/options": [200, 400, 429],
  "POST /api/auth/login/verify": [400, 401, 429],
  "POST /api/auth/logout": [200],
  "POST /logout": [403], // from another site
  "GET /login/new": [200, 302, 303],
  // Getting back in with the account's email (account-email.ts): for someone with no session. The page (or to sign-in where this site sends
  // no email); asking sends a code only to an address on an account and answers alike either way; a code back is refused unless it's right.
  "GET /login/recover": [200, 303],
  // Getting back in by email (src/account-email.ts): a request without this site's Origin is refused (403) before anything is read.
  "POST /api/recover": [200, 400, 403, 404, 429],
  "POST /api/recover/confirm": [400, 403, 404, 429],
  "POST /login/new": [302, 303, 400, 403],
  "POST /login/attach": [302, 303, 400, 403],
  "POST /login/:provider": [302, 303, 400, 403, 404],
  "GET /login/:provider/callback": [302, 303, 400],
  "GET /authorize": [302, 303, 400],
  "POST /authorize": [302, 303, 400, 401, 403],
  // A signature in the URL is the credential: none here.
  "PUT /upload/:id": [400, 401, 403, 404],
  "PUT /upload/stage/:id": [400, 401, 403, 404],
  // OAuth's protocol: a bad body is refused; registering an app is open, and grants nothing until a person consents.
  "POST /token": [400, 401],
  "POST /register": [200, 201, 400],
};
const REFUSED = new Set([401, 403, 404, 405]);

// ---------- state: gated, and pages ----------

const BYPASSED = ["/manifest.webmanifest", "/sw.js", "/favicon.ico", "/robots.txt", "/css/app.css", "/icons/mark.svg", "/fonts/instrument-sans-var.woff2"];
const PUBLIC_PAGES = ["/", "/privacy", "/terms", ...(PLAN ? ["/pricing"] : [])];
// Every spelling of the pricing page the static files might answer to (src/app.ts PRICING_NAMES): with the plan only /pricing is
// the page; without it, none is.
const PRICING_SPELLINGS = ["/pricing", "/pricing/", "/pricing.html", "/Pricing", "/PRICING.HTML", "//pricing", "/pricing//", "/pricing/index.html", "/pric%69ng", "/pricing%2ehtml"];
const NEVER_OPEN = [...PRICING_SPELLINGS.filter((path) => !(PLAN && path === "/pricing")), "/pricing/x", "/pricingx", "/app/", "/app", "/login", "/report", "/login/", "/report/", "/about", "/home", "/study", "/app/nothing", "/design/", "/js/shell/main.js", "/js/lx/ui.js", "/library/catalogue.json", "/api/me", "/api/community/topics", "/audio/", "/css/lx/tokens.css", "/index.html", "/privacy.html", "/terms.html", "/privacy/", "/terms/", "/PRIVACY", "/Terms", "/privacy;x", "/privacy%2f", "/privacy/../app/", "/%2e%2e/app/", "/privacy/%2e%2e/app/", "/privacy%2f..%2fapp/", "/css/site.css/", "/css/site.css/../app/", "/css/site.cssx", "/css/site", "/terms/x"];

async function gateHolds() {
  for (const path of NEVER_OPEN) {
    const r = await raw("GET", path);
    assert(r.status === 303 && /^\/_gate\?next=/.test(r.headers.location ?? ""), `GET ${path}: ${r.status} ${r.headers.location ?? ""}, not the gate`);
    assert(!/<main|<title>(?!.*password)/i.test(r.text), `GET ${path} sent a page`);
  }
  // An address that isn't there, asked for as a browser asks for a page, gets the gate like any other: the not-found page (src/pages.ts) is only
  // ever behind it, so nothing tells which addresses exist.
  for (const path of ["/about", "/home", "/study", "/app/nothing", "/login/", "/report/"]) {
    const r = await raw("GET", path, { headers: { Accept: "text/html,application/xhtml+xml" } });
    assert(r.status === 303 && /^\/_gate\?next=/.test(r.headers.location ?? ""), `GET ${path} as a page: ${r.status} ${r.headers.location ?? ""}, not the gate`);
    assert(!r.text.includes("no page here"), `GET ${path}: the not-found page before the gate`);
  }
  // Writing never gets past it, on an open page or anywhere else.
  for (const path of [...PUBLIC_PAGES, "/css/site.css", "/app/", "/api/me"]) {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const r = await raw(method, path);
      assert(r.status === 401 && r.text.includes("site_locked"), `${method} ${path}: ${r.status}, not locked`);
    }
  }
  // A route from the code, with no cookie: locked, unless it's on the bypass list (machine paths with credentials of their own).
  // /api/billing/stripe: Stripe's webhook, signed (src/billing.ts), so it never waits behind the password.
  const bypassed = /^\/(mcp|\.well-known\/|token|register|api\/v1\/|upload\/|robots\.txt|api\/billing\/stripe$)/;
  let locked = 0;
  for (const { method, path } of ROUTES) {
    if (bypassed.test(path) || path === "*") continue;
    const url = path.replace(/:[a-z]+/g, "x").replace(/\*$/, "x");
    if (PUBLIC_PAGES.includes(url)) continue;
    const m = method === "ALL" ? "GET" : method;
    const r = await raw(m, url);
    assert(m === "GET" ? r.status === 303 : r.status === 401, `${m} ${url}: ${r.status}, past the gate`);
    locked++;
  }
  return locked;
}

const indexHeader = (r) => r.headers["x-robots-tag"] ?? "";

if (STATE === "gated" || STATE === "pages") {
  console.log(`gate check (${STATE}): ${BASE}`);

  await stage("robots.txt says no to everything", async () => {
    const r = await raw("GET", "/robots.txt");
    assert(r.status === 200 && r.text.trim() === "User-agent: *\nDisallow: /", `robots.txt: ${r.status} ${r.text}`);
  });

  await stage("what's on the bypass list answers (the gate page needs it), and no more", async () => {
    for (const path of BYPASSED) {
      const r = await raw("GET", path);
      assert(r.status === 200, `${path}: ${r.status}`);
    }
    return `${BYPASSED.length} files`;
  });

  await stage("nothing else opens: other spellings, a page's neighbors, every route in the code, and every write", async () => `${NEVER_OPEN.length} paths, ${await gateHolds()} routes`);

  if (STATE === "gated") {
    await stage("the public pages are behind it", async () => {
      for (const path of [...PUBLIC_PAGES, "/css/site.css"]) {
        const r = await raw("GET", path);
        assert(r.status === 303, `${path}: ${r.status}, open with the gate on and GATE_PUBLIC_PAGES off`);
      }
    });
    await stage("a card fetcher gets the gate", async () => {
      const r = await raw("GET", "/", { headers: { "User-Agent": "Twitterbot/1.0" } });
      assert(r.status === 303, `Twitterbot: ${r.status}`);
    });
  } else {
    await stage(`the ${PUBLIC_PAGES.length} pages and their stylesheet open, for reading`, async () => {
      for (const path of [...PUBLIC_PAGES, "/css/site.css"]) {
        const r = await raw("GET", path);
        assert(r.status === 200, `GET ${path}: ${r.status}`);
        const head = await raw("HEAD", path);
        assert(head.status === 200, `HEAD ${path}: ${head.status}`);
      }
    });
    await stage(`still out of search: the header on all ${PUBLIC_PAGES.length}, robots.txt above`, async () => {
      for (const path of PUBLIC_PAGES) {
        const r = await raw("GET", path);
        assert(/noindex/.test(indexHeader(r)), `${path}: X-Robots-Tag "${indexHeader(r)}"`);
      }
    });
    await stage("what they say to read isn't a way in: their links lead to the gate, and they set no cookie", async () => {
      for (const path of PUBLIC_PAGES) {
        const r = await raw("GET", path);
        assert(!r.headers["set-cookie"], `${path} set a cookie`);
        for (const m of r.text.matchAll(/<a[^>]+href="(\/[^"#]*)"/g)) {
          const link = m[1].split("?")[0];
          if (PUBLIC_PAGES.includes(link)) continue;
          const target = await raw("GET", link);
          assert(target.status === 303, `${path} links to ${link}: ${target.status}`);
        }
      }
    });
  }

  await stage("the password still works, and only the right one", async () => {
    assert(PASSWORD, "--password");
    const wrong = await raw("POST", "/_gate", { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "password=wrong&next=%2F" });
    assert(wrong.status === 401, `the wrong password: ${wrong.status}`);
    const right = await raw("POST", "/_gate", { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password: PASSWORD, next: "/app/" }).toString() });
    const cookie = (right.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("lc_gate="));
    assert(right.status === 303 && cookie, `the right password: ${right.status}`);
    const past = await raw("GET", "/design/", { headers: { Cookie: cookie } });
    assert(past.status === 200, `past the gate with its cookie: ${past.status}`);
    // The way back: a cookie from before the gate came off still works when it goes on again.
    if (COOKIE_FILE && existsSync(COOKIE_FILE)) {
      const old = await raw("GET", "/design/", { headers: { Cookie: readFileSync(COOKIE_FILE, "utf8").trim() } });
      assert(old.status === 200, `the cookie from before the switch: ${old.status}`);
      return "and the cookie from before the switch";
    }
    if (COOKIE_FILE) writeFileSync(COOKIE_FILE, cookie, { mode: 0o600 });
  });
}

// ---------- state: public ----------

if (STATE === "public") {
  console.log(`gate check (public, sharing ${SHARING}): ${BASE}`);
  const run = randomBytes(3).toString("hex");
  const secret = (what) => `gatecheck-${what}-${run}`;
  const MARKERS = { note: secret("note"), upload: secret("upload"), look: secret("look"), report: secret("report"), name: secret("name") };

  const account = (name, { admin = false, ageDays = 30 } = {}) => {
    const id = `gc${run}${randomBytes(5).toString("hex")}`;
    const now = Date.now();
    const cookie = randomBytes(24).toString("base64url");
    const token = `lct_${randomBytes(24).toString("base64url")}`;
    sql([
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - ageDays * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'gate-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 8))}, ${now}, ${admin ? 1 : 0})`,
      ...(admin ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'gate-check')`] : []),
    ].join("; "));
    return { id, name, cookie, token };
  };
  const as = async (who, method, path, body) => {
    const r = await raw(method, path, { headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json", Origin: BASE }, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null;
    try {
      json = JSON.parse(r.text);
    } catch {}
    return { ...r, json };
  };

  // --live: no accounts, and the stages that write first (or read this copy's files) are skipped, saying so.
  const owner = LIVE ? null : account(MARKERS.name, { admin: true });
  const reporter = LIVE ? null : account(`Reporter ${run}`);
  const ordinary = LIVE ? null : account(`Ordinary ${run}`);
  const local = (name, fn) => (LIVE ? (results.push({ name, ok: true, skipped: true }), console.log(`  --    ${name}: skipped (--live writes nothing)`)) : stage(name, fn));
  const ids = {};

  await local("private data to go looking for: a note, an upload, a look, a live pack, a hidden pack", async () => {
    const note = await as(owner, "POST", "/api/notes", { text: MARKERS.note });
    assert(note.status === 200, `note: ${note.status} ${note.text.slice(0, 200)}`);
    ids.note = note.json.id ?? note.json.note?.id;
    const look = await as(owner, "PUT", "/api/look", { baseRev: 0, look: { name: MARKERS.look } });
    assert(look.status === 200, `look: ${look.status} ${look.text.slice(0, 200)}`);
    const made = await raw("POST", "/api/v1/uploads", { headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ filename: `${MARKERS.upload}.m4a`, contentType: "audio/mp4" }) });
    assert(made.status === 200, `upload: ${made.status} ${made.text.slice(0, 200)}`);
    const upload = JSON.parse(made.text);
    ids.upload = upload.id ?? upload.upload?.id;
    ids.uploadUrl = upload.uploadUrl ?? upload.url;
    const terms = await as(owner, "GET", "/api/community/terms");
    await as(owner, "POST", "/api/community/terms", { version: terms.json.version });
    for (const [key, file] of [["live", "check-nl"], ["hidden", "check-de"]]) {
      const pack = JSON.parse(readFileSync(join(APP, `scripts/fixtures/packs/${file}.json`), "utf8"));
      pack.id = `${pack.id}-${run}`;
      pack.items[0].means += ` (${run})`; // Explore refuses the same content twice, and a state may be checked again.
      const shared = await as(owner, "POST", "/api/community/share", { pack, level: "A1", topics: [] });
      assert(shared.status === 200, `share ${key}: ${shared.status} ${shared.text.slice(0, 300)}`);
      ids[key] = { id: shared.json.id, version: shared.json.version };
    }
    // Control: before the report, the hidden one's file is there to find.
    const before = await raw("GET", `/library/packs/${ids.hidden.id}/${ids.hidden.version}/pack.json`);
    assert(before.status === 200, `the pack's file before its report: ${before.status}`);
    const reported = await as(reporter, "POST", `/api/community/items/${ids.hidden.id}/report`, { reason: "minors", details: MARKERS.report });
    assert(reported.status === 200 && reported.json.hidden === true, `report: ${reported.status} ${reported.text.slice(0, 200)}`);
    // Who may share, as this server's var says.
    const tried = await as(ordinary, "POST", "/api/community/terms", { version: terms.json.version });
    assert(tried.status === 200, `an ordinary account's terms: ${tried.status}`);
    const pack = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
    pack.id = `ord-${run}`;
    pack.items[0].means += ` (${run}, ordinary)`;
    const share = await as(ordinary, "POST", "/api/community/share", { pack, level: "A1", topics: [] });
    assert(SHARING === "admins" ? share.status === 403 : share.status === 200, `an ordinary account sharing, with sharing ${SHARING}: ${share.status} ${share.text.slice(0, 200)}`);
    return `sharing ${SHARING}: an ordinary account's share answers ${share.status}`;
  });

  const walk = [];
  const fill = (path) =>
    path
      .replace(":hash", "a".repeat(64))
      .replace(":provider", "github")
      .replace(":lang", "nl")
      .replace(/\/api\/uploads\/:id/, `/api/uploads/${ids.upload ?? "x"}`)
      .replace(/\/api\/community\/items\/:id/, `/api/community/items/${ids.hidden?.id ?? "x"}`)
      .replace(/:[a-z]+/g, "x")
      .replace(/\*$/, "catalogue.json");
  const secretsIn = (text) => Object.values(MARKERS).filter((marker) => text.includes(marker));

  await local("every route in the code, with no account: only what's on the list answers, and nothing private comes back", async () => {
    const wrong = [];
    for (const { method, path } of ROUTES) {
      if (path === "*") continue;
      const m = method === "ALL" ? "GET" : method;
      const key = `${method} ${path}`;
      const r = await raw(m, fill(path), m === "GET" || m === "HEAD" ? {} : { headers: { "Content-Type": "application/json" }, body: "{}" });
      const allowed = OPEN[key];
      const ok = allowed ? allowed.includes(r.status) : REFUSED.has(r.status);
      const leaks = secretsIn(r.text);
      walk.push({ route: key, asked: fill(path), status: r.status, open: Boolean(allowed), ...(r.headers.location ? { to: r.headers.location } : {}), ...(leaks.length ? { leaks } : {}) });
      if (!ok || leaks.length) wrong.push(`${key}: ${r.status}${leaks.length ? `, showing ${leaks.join(", ")}` : ""}${allowed ? "" : " (not on the list)"}`);
    }
    writeFileSync(join(OUT, "no-account-routes.json"), JSON.stringify(walk, null, 1));
    assert(!wrong.length, `${wrong.length} routes:\n${wrong.join("\n")}`);
    return `${walk.length} routes: ${walk.filter((w) => w.open && w.status < 300).length} answer, the rest refuse or redirect`;
  });

  await local("a list's route that isn't in the code any more is a mistake in this check", async () => {
    const inCode = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
    // The public pages are static files here; a copy of the app may route them, so they're on the list either way.
    const gone = Object.keys(OPEN).filter((key) => !["ALL *", "GET /privacy", "GET /terms"].includes(key) && !inCode.has(key));
    assert(!gone.length, `on OPEN, not in the code: ${gone.join(", ")}`);
  });

  await local("the people's own things by their ids: refused", async () => {
    const asked = [`/api/uploads/${ids.upload}/file`, "/api/notes", "/api/me", "/api/me/export", "/api/look", "/api/themes", "/api/tokens", "/api/connections", `/api/community/items/${ids.hidden.id}`, `/api/community/items/${ids.live.id}`, "/api/community/explore", "/api/community/items", "/api/community/requests", "/api/translate/languages", "/api/v1/whoami", "/api/v1/notes", "/api/v1/mod/pending"];
    for (const path of asked) {
      const r = await raw("GET", path);
      assert(r.status === 401, `${path}: ${r.status} ${r.text.slice(0, 120)}`);
      assert(!secretsIn(r.text).length, `${path} showed something private`);
    }
    const mcp = await raw("POST", "/mcp", { headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    assert(mcp.status === 401 && /WWW-Authenticate/i.test(Object.keys(mcp.headers).join(" ")), `/mcp: ${mcp.status}`);
    return `${asked.length} paths and /mcp`;
  });

  await local("the open library: public by design, and a hidden pack isn't in it", async () => {
    const catalog = await raw("GET", "/library/catalogue.json");
    assert(catalog.status === 200, `catalog: ${catalog.status}`);
    assert(!secretsIn(catalog.text).length, "the catalog names something private");
    const hidden = await raw("GET", `/library/packs/${ids.hidden.id}/${ids.hidden.version}/pack.json`);
    assert(hidden.status === 404, `a hidden pack's file: ${hidden.status}`);
    const live = await raw("GET", `/library/packs/${ids.live.id}/${ids.live.version}/pack.json`);
    assert(live.status === 200, `a live shared pack's file: ${live.status}`);
    for (const path of ["/library/../../wrangler.jsonc", "/library/%2e%2e/%2e%2e/.dev.vars", "/library/uploads/x", "/library/users.json", "/library/"]) {
      const r = await raw("GET", path);
      assert(r.status !== 200 || !/account_id|VAPID|lct_/.test(r.text), `${path}: ${r.status}`);
    }
    return `a live shared pack's file is readable with no account; the account's name in it: ${live.text.includes(MARKERS.name)}`;
  });

  await local("nothing in public/ that shouldn't be served", async () => {
    const SKIP = new Set(["models", "flags", "fonts", "audio", "startup"]);
    const TEXT = new Set([".js", ".mjs", ".css", ".html", ".json", ".webmanifest", ".svg", ".txt", ".md"]);
    const SECRET = [/lct_[A-Za-z0-9_-]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY/, /\bsk-[A-Za-z0-9]{20,}/, /GATE_PASSWORD\s*[:=]\s*["'][^"']/, /AKIA[0-9A-Z]{16}/];
    const NOT_FOR_PUBLIC = /\.(env|map|sql|sh|py|ts|bak|orig|key|pem)$|(^|\/)\.[^/]+$/;
    const bad = [];
    let files = 0;
    const walkDir = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (!SKIP.has(name)) walkDir(path);
          continue;
        }
        files++;
        const rel = path.slice(APP.length + 1);
        if (NOT_FOR_PUBLIC.test(name)) bad.push(`${rel}: a file like this isn't for serving`);
        if (TEXT.has(extname(name))) {
          const text = readFileSync(path, "utf8");
          for (const pattern of SECRET) if (pattern.test(text)) bad.push(`${rel}: ${pattern}`);
        }
      }
    };
    walkDir(join(APP, "public"));
    assert(!bad.length, bad.join("\n"));
    return `${files} files`;
  });

  await stage("robots.txt: the public pages and what they load are open, everything private is asked to stay out", async () => {
    const r = await raw("GET", "/robots.txt");
    assert(r.status === 200, `robots.txt: ${r.status}`);
    const lines = r.text.split("\n").filter(Boolean);
    assert(lines[0] === "User-agent: *", `robots.txt: ${r.text}`);
    assert(!lines.includes("Disallow: /"), "it still says no to everything");
    const no = lines.filter((l) => l.startsWith("Disallow: ")).map((l) => l.slice(10));
    const blocked = (path) => no.some((prefix) => path.startsWith(prefix));
    for (const path of [...PUBLIC_PAGES, "/icons/share-card.png", "/css/site.css", "/fonts/instrument-sans-var.woff2", "/icons/mark.svg"]) assert(!blocked(path), `${path} is blocked`);
    for (const path of ["/app/", "/api/me", "/login", "/logout", "/authorize", "/mcp", "/token", "/register", "/upload/x", "/library/catalogue.json", "/design/", "/models/x", "/_gate", "/js/x.js", "/audio/x.mp3"]) assert(blocked(path), `${path} isn't asked to stay out`);
    return `${no.length} paths asked to stay out`;
  });

  await stage(`search: exactly the ${PUBLIC_PAGES.length} public pages may be indexed`, async () => {
    for (const path of PUBLIC_PAGES) {
      const r = await raw("GET", path);
      assert(r.status === 200, `${path}: ${r.status}`);
      assert(!indexHeader(r), `${path}: X-Robots-Tag "${indexHeader(r)}"`);
      assert(!/name="robots"/.test(r.text), `${path}: a robots meta tag`);
      assert(r.text.includes(`<link rel="canonical" href="https://lexicommons.com${path}">`), `${path}: its canonical link`);
    }
    const login = await raw("GET", "/login");
    assert(/noindex/.test(indexHeader(login)) && /name="robots" content="noindex/.test(login.text), `/login: ${indexHeader(login)}`);
    const design = await raw("GET", "/design/");
    assert(/noindex/.test(indexHeader(design)), `/design/: ${design.status} ${indexHeader(design)}`);
    // The try-out (/try/): open to anyone with no account, never indexed.
    const tryOut = await raw("GET", "/try/");
    assert(tryOut.status === 200 && /noindex/.test(indexHeader(tryOut)) && /name="robots" content="noindex/.test(tryOut.text), `/try/: ${tryOut.status} ${indexHeader(tryOut)}`);
    for (const path of ["/app/index.html", "/nothing-here"]) {
      const r = await raw("GET", path);
      if ((r.headers["content-type"] ?? "").startsWith("text/html")) assert(/noindex/.test(indexHeader(r)), `${path}: ${r.status} ${indexHeader(r)}`);
    }
  });

  await stage(PLAN ? "the pricing page: /pricing is it, its other spellings lead there or nowhere, and it never names the company" : "no pricing page: no spelling of it answers with the page", async () => {
    const isPage = (r) => r.status === 200 && r.text.includes("<title>Pricing · Lexicommons</title>");
    const seen = {};
    for (const path of PRICING_SPELLINGS) {
      const r = await raw("GET", path);
      seen[path] = `${r.status}${r.headers.location ? ` → ${r.headers.location}` : ""}`;
      if (PLAN && path === "/pricing") {
        assert(isPage(r), `/pricing: ${r.status}, not the page`);
        // The page names no company: the terms say who sells the plan.
        assert(!/needwright/i.test(r.text), "/pricing names NeedWright");
        assert(!/\$X\b|\bTODO\b|\bTBD\b/.test(r.text), "/pricing has a placeholder");
        continue;
      }
      assert(!isPage(r), `${path}: the pricing page (${r.status})`);
      if (PLAN) {
        // Another spelling may send you to the page, but only the page itself, on this site.
        if (r.headers.location) assert(new URL(r.headers.location, BASE).pathname === "/pricing", `${path} → ${r.headers.location}`);
      } else {
        assert(r.status === 404 || (r.status >= 300 && r.status < 400 && !/pricing/i.test(new URL(r.headers.location ?? "/", BASE).pathname)), `${path}: ${seen[path]}, where the plan isn't offered`);
      }
    }
    writeFileSync(join(OUT, "pricing-spellings.json"), JSON.stringify(seen, null, 1));
    return Object.entries(seen).map(([p, v]) => `${p} ${v}`).join("; ");
  });

  await stage(PLAN ? "the public pages say what the plan is: its parts served, nothing of a site without it" : "the public pages say nothing of payments, a plan, prices, Stripe, a trial or the in-app AI", async () => {
    const said = {};
    for (const path of ["/", "/privacy", "/terms"]) {
      const r = await raw("GET", path);
      assert(r.status === 200, `${path}: ${r.status}`);
      // Served whole each time: a browser's copy from before a switch is never kept by a 304.
      assert(!r.headers.etag && !r.headers["last-modified"], `${path}: a validator (${r.headers.etag ?? r.headers["last-modified"]})`);
      const again = await raw("GET", path, { headers: { "If-None-Match": '"anything"', "If-Modified-Since": new Date().toUTCString() } });
      assert(again.status === 200 && again.text === r.text, `${path} asked again with validators: ${again.status}`);
      // What the server takes out is gone as markup too, and what stays has no marks of the other side.
      const marks = [...r.text.matchAll(/\sdata-(no-)?(plan|own-key)\b/g)].map((m) => m[0].trim());
      const kept = PLAN ? marks.filter((m) => m === "data-no-plan") : marks.filter((m) => m === "data-plan");
      assert(!kept.length && !marks.includes("data-own-key"), `${path} still has ${[...new Set(marks)].join(", ")}`);
      said[path] = planWordsIn(readable(r.text));
    }
    if (!PLAN) {
      const found = Object.entries(said).filter(([, words]) => words.length);
      assert(!found.length, found.map(([path, words]) => `${path}: ${words.slice(0, 4).map((w) => `"${w.word}" in …${w.around}…`).join("; ")}`).join("\n"));
      return "/, /privacy and /terms: none";
    }
    // The control: with the plan on, its parts are served (the same words the check refuses without it).
    for (const [path, word] of [["/privacy", /stripe/i], ["/terms", /the plan/i], ["/", /with the plan/i]]) assert(said[path].some((w) => word.test(w.word) || word.test(w.around)), `${path} doesn't say ${word}`);
    return Object.entries(said).map(([path, words]) => `${path}: ${words.length}`).join(", ");
  });

  await stage("the share card: what a link shows, fetched as the card fetchers fetch it", async () => {
    for (const agent of ["Twitterbot/1.0", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"]) {
      const r = await raw("GET", "/", { headers: { "User-Agent": agent } });
      assert(r.status === 200, `${agent}: ${r.status}`);
      const meta = (key) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(r.text)?.[1];
      assert(meta("og:title") === "Lexicommons: learn a language for free", `og:title: ${meta("og:title")}`);
      assert(meta("og:description")?.length > 40, "og:description");
      assert(meta("og:url") === "https://lexicommons.com/", `og:url: ${meta("og:url")}`);
      assert(meta("twitter:card") === "summary_large_image", "twitter:card");
      assert(meta("og:image") === "https://lexicommons.com/icons/share-card.png", `og:image: ${meta("og:image")}`);
      assert(meta("og:image:alt"), "og:image:alt");
    }
    const image = await raw("GET", "/icons/share-card.png", { headers: { "User-Agent": "Twitterbot/1.0" } });
    assert(image.status === 200 && image.headers["content-type"] === "image/png", `the card: ${image.status} ${image.headers["content-type"]}`);
    const [w, h] = [image.bytes.readUInt32BE(16), image.bytes.readUInt32BE(20)];
    assert(w === 1200 && h === 630, `the card is ${w} × ${h}`);
    assert(image.bytes.length < 1_000_000, `the card is ${image.bytes.length} bytes`);
    return `1200 × 630, ${Math.round(image.bytes.length / 1024)} KB`;
  });

  await stage("the gate is gone: its page answers nothing, and a visitor gets no cookie", async () => {
    const page = await raw("GET", "/_gate");
    assert(page.status !== 200 && !/password/i.test(page.text), `/_gate: ${page.status}`);
    const post = await raw("POST", "/_gate", { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "password=x" });
    assert(!(post.headers["set-cookie"] ?? []).length, "/_gate set a cookie");
    for (const path of [...PUBLIC_PAGES, "/css/site.css", "/app/", "/login"]) {
      const r = await raw("GET", path);
      assert(!(r.headers["set-cookie"] ?? []).length, `${path} set a cookie`);
    }
  });

  await stage("an address that isn't there: a browser asking for a page gets the not-found page (404, its words, not kept); the API JSON; a file the bare 404", async () => {
    const title = core["core.notFound.title"][0];
    const asPage = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
    const seen = {};
    for (const path of ["/about", "/home", "/study", "/app/nothing", "/login/x/y", "/privacy/x"]) {
      const r = await raw("GET", path, { headers: asPage });
      seen[path] = r.status;
      assert(r.status === 404, `GET ${path}: ${r.status}`);
      assert((r.headers["content-type"] ?? "").startsWith("text/html"), `GET ${path}: ${r.headers["content-type"]}`);
      assert(r.text.includes(title.replace(/'/g, "&#39;")) || r.text.includes(title), `GET ${path}: not the page's words`);
      assert(r.text.includes('href="/"') && r.text.includes('href="/login"'), `GET ${path}: no way on (Home, Sign in)`);
      assert(/no-store/.test(r.headers["cache-control"] ?? ""), `GET ${path}: kept (${r.headers["cache-control"]})`);
      assert(/noindex/.test(r.headers["x-robots-tag"] ?? ""), `GET ${path}: may be indexed`);
    }
    const head = await raw("HEAD", "/about", { headers: asPage });
    assert(head.status === 404 && head.bytes.length === 0, `HEAD /about: ${head.status}, ${head.bytes.length} bytes`);
    // What a page asks for (a script, a picture) and anything that isn't a browser's page: the bare 404, never the page.
    for (const [path, accept] of [["/js/nothing.js", "*/*"], ["/icons/nothing.png", "image/avif,image/webp,*/*"], ["/about", "*/*"], ["/about", "application/json"]]) {
      const r = await raw("GET", path, { headers: { Accept: accept } });
      assert(r.status === 404 && !r.text.includes("no page here"), `GET ${path} (${accept}): ${r.status}, the page`);
    }
    const post = await raw("POST", "/about", { headers: { ...asPage, "Content-Type": "application/x-www-form-urlencoded" }, body: "x=1" });
    assert(!post.text.includes("no page here"), `POST /about: ${post.status}, the page`);
    // The API answers in JSON, even to a browser asking for a page.
    for (const accept of ["application/json", asPage.Accept]) {
      const r = await raw("GET", "/api/nothing-here", { headers: { Accept: accept } });
      assert(r.status === 404 && (r.headers["content-type"] ?? "").startsWith("application/json"), `GET /api/nothing-here (${accept}): ${r.status} ${r.headers["content-type"]}`);
      assert(typeof JSON.parse(r.text).error === "string" && !r.text.includes("<"), `GET /api/nothing-here: ${r.text.slice(0, 120)}`);
    }
    // A slash after a page: to the page, its query kept; the pages themselves as they were.
    for (const [path, to] of [["/login/", "/login"], ["/login/?next=%2Fapp%2F", "/login?next=%2Fapp%2F"], ["/report/", "/report"]]) {
      const r = await raw("GET", path, { headers: asPage });
      assert(r.status === 301 && r.headers.location === to, `GET ${path}: ${r.status} → ${r.headers.location}`);
    }
    const privacy = await raw("GET", "/privacy/", { headers: asPage });
    assert(privacy.status >= 300 && privacy.status < 400, `GET /privacy/: ${privacy.status}`);
    for (const path of ["/privacy", "/login", "/report"]) {
      const r = await raw("GET", path, { headers: asPage });
      assert(r.status === 200 && !r.text.includes("no page here"), `GET ${path}: ${r.status}`);
    }
    return Object.entries(seen).map(([p, s]) => `${p} ${s}`).join("; ");
  });

  await stage("the cookie table is what the code sets", async () => {
    const inCode = new Set();
    // Only the source files: a folder in src/ (an editor's, say) holds no cookies and can't be read as one.
    for (const file of readdirSync(join(APP, "src"), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".ts")).map((entry) => entry.name)) {
      const text = readFileSync(join(APP, "src", file), "utf8");
      for (const m of text.matchAll(/_COOKIE = "(lc_[a-z]+)"/g)) inCode.add(m[1]);
    }
    assert(inCode.has("lc_session") && inCode.has("lc_gate"), `read from the code: ${[...inCode]}`);
    inCode.delete("lc_gate");
    const page = (await raw("GET", "/privacy")).text;
    const inTable = new Set([...page.matchAll(/<td><code>(lc_[a-z]+)<\/code><\/td>/g)].map((m) => m[1]));
    assert(!page.includes("lc_gate"), "lc_gate is still in the table");
    assert(JSON.stringify([...inCode].sort()) === JSON.stringify([...inTable].sort()), `the code: ${[...inCode].sort()}; the table: ${[...inTable].sort()}`);
    return [...inTable].sort().join(", ");
  });

  await stage("a redirect can't be pointed off the site", async () => {
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "%2F%2Fevil.example"]) {
      const r = owner ? await as(owner, "GET", `/login?next=${encodeURIComponent(next)}`) : await raw("GET", `/login?next=${encodeURIComponent(next)}`);
      assert(![301, 302, 303, 307, 308].includes(r.status) || !/^(https?:)?\/\/|^\/\\/.test(r.headers.location ?? ""), `next=${next}: to ${r.headers.location}`);
    }
  });

  await stage("in Chrome: what a visitor can open loads only from this site, and shows no error", async () => {
    const { chromium } = await import("./quiet-browser.mjs");
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const origin = new URL(BASE).origin;
    const elsewhere = [];
    const problems = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith("http") && url.origin !== origin) elsewhere.push(`${page.url()} → ${url.origin}`);
    });
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`${page.url()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
    const seen = new Map();
    const queue = [...PUBLIC_PAGES];
    while (queue.length) {
      const path = queue.shift();
      if (seen.has(path)) continue;
      const response = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
      await page.waitForTimeout(150);
      seen.set(path, { status: response.status(), at: new URL(page.url()).pathname });
      if (PUBLIC_PAGES.includes(path)) {
        await page.screenshot({ path: join(OUT, `page${path === "/" ? "-home" : path.replace("/", "-")}.png`) });
      }
      const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
      for (const href of links) {
        if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/app/") && !seen.has(href.split("#")[0].split("?")[0])) queue.push(href.split("#")[0].split("?")[0]);
      }
    }
    // The app's own door, signed out, the design system's page and the try-out: all reachable (the try-out stays itself, no sign-in).
    for (const path of ["/app/", "/design/", "/try/"]) {
      const response = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
      await page.waitForTimeout(400);
      seen.set(path, { status: response.status(), at: new URL(page.url()).pathname });
    }
    await browser.close();
    writeFileSync(join(OUT, "no-account-pages.json"), JSON.stringify(Object.fromEntries(seen), null, 1));
    assert(seen.get("/app/").at === "/login", `/app/ with no account stayed at ${seen.get("/app/").at}`);
    assert(seen.get("/try/").status === 200 && seen.get("/try/").at === "/try/", `/try/ with no account: ${JSON.stringify(seen.get("/try/"))}`);
    assert(!elsewhere.length, `loaded from elsewhere:\n${[...new Set(elsewhere)].join("\n")}`);
    assert(!problems.length, problems.slice(0, 5).join("\n"));
    return `${seen.size} pages: ${[...seen.keys()].join(", ")}`;
  });
}

writeFileSync(join(OUT, `gate-check-${STATE}.json`), JSON.stringify({ state: STATE, results }, null, 1));
const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped).length;
const ran = results.length - skipped;
const mode = `${STATE}${LIVE ? ", live, read only" : ""}`;
console.log(failed.length ? `gate check (${mode}): ${failed.length} of ${ran} stages FAILED` : `gate check (${mode}): all ${ran} stages passed${skipped ? `, ${skipped} skipped (they write)` : ""}`);
process.exit(failed.length ? 1 : 0);
