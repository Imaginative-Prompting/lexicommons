// The in-app AI on the plan (src/ai-hosted.ts, ai/hosted.js, practice/inapp-run.js), end to end on a LOCAL server, on a phone screen in
// Chrome for Testing: an account without the plan gets none of it (Practice not offered, the server refusing); put on the plan (a
// subscription row written into the local D1), the AI page's Practice row, the choice drawn in place (no layout shift), a practice
// run on Lexicommons' key (the server's request to OpenRouter with ZDR, no data collection, the model at low effort and an opaque tag;
// the device sending only which practice; nothing from the page to any provider), a turn graded into evidence, the month's meter
// moving by what OpenRouter said each call cost and the ledger holding no words, the month's included AI used up (said in words with no
// Try again, nothing called) and back, the summary, Translate with AI's call, used up with a key of yours on the device (Carry on with
// your own key switching the practice to it: a FAKE key, its provider played for the page), and the plan ending.
//
// OpenRouter (and Stripe, for the account's deletion) are a stand-in this script serves on --standin-port, which the server must be
// started with. --real: OpenRouter is the real one (the server's OPENROUTER_API_KEY from its environment, never this script's), and
// what each call cost is logged to <outDir>/spend.jsonl; the stand-in still plays Stripe. Server (sandbox off):
//   npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>
//   npx wrangler dev --port <port> --local-upstream localhost:<port> --persist-to <dir> --var GATE_ENABLED:false \
//     --var PUBLIC_ORIGIN:http://localhost:<port> --var RP_ID:localhost --var UPLOAD_SIGNING_SECRET:<any local value> \
//     --var PLAN_ENABLED:true --var STRIPE_PRICE_MONTHLY:price_fake_month --var STRIPE_PRICE_YEARLY:price_fake_year \
//     --var STRIPE_SECRET_KEY:sk_test_FAKE --var STRIPE_WEBHOOK_SECRET:whsec_FAKE --var STRIPE_API_BASE:http://localhost:<standin> \
//     --var OWN_KEY_ENABLED:true --var OPENROUTER_API_KEY:or-check-not-a-key --var OPENROUTER_API_BASE:http://localhost:<standin>
//     (OPENROUTER_* for the stand-in only; --real leaves them out and the server has its own key in its environment)
//   python3 pipelines/lyric-video/tools/gpu.py run --who <session> --label "hosted ai check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/hosted-ai-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--standin-port 8829] [--real]
// LOCAL only: it makes and deletes its own account (exit 0 = pass).
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [BASE, outArg = "hosted-ai-check-out"] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--persist-to", "--standin-port"].includes(args[i - 1])));
// Resolved here: wrangler runs from the app's folder, where a relative state would be a new, empty one.
const PERSIST = option("persist-to") && resolve(option("persist-to"));
const STANDIN_PORT = Number(option("standin-port", "8829"));
const REAL = args.includes("--real");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !PERSIST) {
  console.error("hosted-ai-check makes and deletes an account: give it a local server and its state, e.g. http://localhost:8811 out --persist-to <dir>");
  process.exit(2);
}
// A ceiling for the whole run: a wait that never ends must not hold a lane slot (it once held one for an hour).
setTimeout(() => {
  console.log("FAIL  the whole check ran past 8 minutes: stopped");
  process.exit(3);
}, 8 * 60_000).unref();
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
const NAME = "Hosted AI Check";
const KEY = "or-check-not-a-key";

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

/** The local D1, read and written as the server keeps it. */
const d1 = (sql) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", sql], { cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))[0].results;
const safe = (id) => {
  assert(/^[\w-]+$/.test(id), `an id ${id}`);
  return id;
};

// ---------- the stand-in: OpenRouter (unless --real) and Stripe ----------

const provider = { chats: [], stripe: [] };
const COST = 0.0007; // what the stand-in says each call cost, in dollars
const OPENING = { say: [{ nl: "Hoi! Wat heb je gisteren gedaan?", literal: ["Hi!", "What", "have", "you", "*yesterday*", "*done*"], en: "Hi! What did you do yesterday?", words: { gisteren: "gisteren", gedaan: "doen" } }], expect: "either" };
const GRADED = {
  grades: [{ verdict: "fixed", better: "Gisteren ben ik naar de winkel gegaan.", marks: [{ said: "Gisteren ik ben", fix: "Gisteren ben ik" }], concepts: [{ concept: "p:v2", outcome: "wrong", note: "After gisteren the verb comes next." }], note: "Start with a time word and the verb jumps ahead of ik." }],
  say: [{ nl: "Wat heb je daar gekocht?", literal: ["What", "have", "you", "*there*", "*bought*"], en: "What did you buy there?", words: { gekocht: "kopen" } }],
  expect: "either",
};
const AGAIN = { say: [{ nl: "Leuk! En toen?", literal: ["Nice!", "And", "then?"], en: "Nice! And then?" }], expect: "either" };
const SUMMARY = { text: "Goed gedaan! You talked about yesterday and fixed the verb's place.", went_well: ["the perfect tense"], work_on: ["the verb second after a time word"], new_words: [{ nl: "de winkel", en: "the shop" }] };
const TRANSLATION = { translation: "Goedemorgen, hoe gaat het?", literal: ["Good morning", "how", "goes", "it?"], note: "Gaat het: literally 'goes it'." };
const sse = (obj) => {
  const text = JSON.stringify(obj);
  const pieces = [text.slice(0, 40), text.slice(40, 120), text.slice(120)].filter(Boolean);
  return [
    ": OPENROUTER PROCESSING",
    "",
    ...pieces.flatMap((piece) => [`data: ${JSON.stringify({ id: `gen-${provider.chats.length}`, model: "openai/gpt-6-luna", choices: [{ delta: { content: piece } }] })}`, ""]),
    `data: ${JSON.stringify({ id: `gen-${provider.chats.length}`, choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 3600 }, cost: COST } })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");
};
const standin = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://standin");
    if (url.pathname.startsWith("/v1/subscriptions/")) {
      provider.stripe.push(`${req.method} ${url.pathname}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ id: decodeURIComponent(url.pathname.split("/").pop()), object: "subscription", status: "canceled" }));
    }
    if (url.pathname === "/api/v1/chat/completions" && req.method === "POST") {
      const body = JSON.parse(raw || "{}");
      provider.chats.push({ auth: req.headers.authorization, body });
      const name = body.response_format?.json_schema?.name;
      const text = JSON.stringify(body.messages ?? []);
      const reply = name === "summary" ? SUMMARY : name === "translation" ? TRANSLATION : /Gisteren ik ben naar de winkel/.test(JSON.stringify(body.messages?.at(-1) ?? "")) ? GRADED : provider.chats.length > 2 && /En toen|winkel/.test(text) ? AGAIN : OPENING;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      return res.end(sse(reply));
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "not in the stand-in" } }));
  });
});
await new Promise((ok, fail) => standin.listen(STANDIN_PORT, "127.0.0.1", ok).on("error", fail));

// ---------- the browser ----------

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// Nothing from the page leaves this server: every other address is refused, and noted.
const outside = [];
await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => (outside.push(route.request().url()), route.abort()));
page = await context.newPage();
let expectRefusals = false;
page.on("console", (m) => m.type() === "error" && !(expectRefusals && /status of 40[29]/.test(m.text())) && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const hostedCalls = [];
page.on("request", (r) => r.url().includes("/api/ai/hosted/") && hostedCalls.push({ url: r.url().replace(BASE, ""), body: r.postData() ?? "" }));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const me = () => page.evaluate(async () => (await fetch("/api/me", { cache: "no-store" })).json());
const room = () => page.locator(".lx-practice-room:not([data-ghost])");
const say = async (text) => {
  const box = page.locator('.lx-practice-room [data-part="composer"] input').first();
  await box.fill(text);
  await box.press("Enter");
};
/** The practice's reply turns, as the room keeps them: however the model put its answer (lines, or an explanation alone). */
const replies = () => page.evaluate(async (id) => ((await (await fetch(`/api/practice/${id}?after=0`, { cache: "no-store" })).json()).turns ?? []).filter((t) => t.who === "ai" && t.type === "reply").length, practiceId);
const moreReplies = async (than, timeout = 45_000) => {
  const end = Date.now() + timeout;
  for (;;) {
    const now = await replies();
    if (now > than) return now;
    if (Date.now() > end) throw new Error(`no new reply in ${timeout / 1000} s (still ${now})`);
    await page.waitForTimeout(500);
  }
};
const spend = (what) => {
  const rows = d1(`SELECT feature, cost_micro, prompt_tokens, completion_tokens FROM ai_usage WHERE user_id = '${safe(userId)}' ORDER BY id`);
  if (REAL) for (const r of rows.slice(logged)) appendFileSync(join(OUT, "spend.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), what, ...r, dollars: r.cost_micro / 1e6 })}\n`);
  logged = rows.length;
  return rows;
};
let userId = null;
let logged = 0;
let practiceId = null;

// ---------- the run ----------

await stage("sign up; the site offers the plan and its AI, and this account hasn't the plan", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', NAME);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  const m = await me();
  userId = m.user.id;
  assert(m.features?.hostedAi === true && m.features?.plan === true, `features ${JSON.stringify(m.features)}`);
  assert(m.plan && m.plan.active === false, `plan ${JSON.stringify(m.plan)}`);
  return `features ${JSON.stringify(m.features)}`;
});

await stage("without the plan: Practice isn't offered, and the server refuses its AI and a practice on it", async () => {
  await page.goto(`${BASE}/app/#practice`);
  await page.getByRole("button", { name: "Connect your AI" }).waitFor();
  assert((await page.getByText(/included in your plan/i).count()) === 0, "no word of the plan");
  expectRefusals = true;
  const statuses = await page.evaluate(async () => {
    const post = (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.status);
    return [await post("/api/ai/hosted/translate", { from: "en", to: "nl", text: "hello" }), await post("/api/practice", { kind: "conversation", answer: "both", minutes: 10, language: "nl", inapp: { engine: "plan", name: "x" } })];
  });
  expectRefusals = false;
  assert(statuses[0] === 402 && statuses[1] === 402, `statuses ${statuses}`);
  assert(provider.chats.length === 0, "nothing reached the provider");
  return `402, 402; no provider call`;
});

await stage("on the plan: the AI page's focus is Practice, with connecting an AI app after it", async () => {
  d1(`INSERT INTO billing_subscriptions (id, user_id, customer, status, interval, current_period_end, updated_at) VALUES ('sub_check_${safe(userId)}', '${userId}', 'cus_check', 'active', 'month', ${Date.now() + 30 * 86400_000}, ${Date.now()})`);
  const m = await me();
  assert(m.plan.active === true && m.plan.ai.allowance === 2_000_000 && m.plan.ai.spent === 0, `plan ${JSON.stringify(m.plan)}`);
  await page.goto(`${BASE}/app/#ai`);
  await page.reload(); // who you are, as the device keeps it, now with the plan
  await page.waitForSelector("html[data-app-ready]");
  const practice = page.locator('[data-part="ai-card"]').getByRole("button", { name: "Practice", exact: true });
  await practice.waitFor();
  const connect = page.locator('[data-part="list-row"]', { hasText: "Or connect an AI app you already use" });
  await connect.waitFor();
  const [cardTop, connectTop] = await Promise.all([practice.boundingBox(), connect.boundingBox()]).then((b) => b.map((x) => x.y));
  assert(cardTop < connectTop, "Practice comes before connecting an AI app");
  assert((await page.getByRole("button", { name: "Connect your AI" }).count()) === 0, "no Connect your AI button: it's the row after");
  await shot("01-ai-page");
  await practice.click();
  await page.waitForURL(/#practice$/);
  await page.getByText("Conversation").first().waitFor();
  return "Practice first; it opens Practice";
});

/**
 * Layout shifts, collected for half a second; never waits on one coming. buffered: every one since this document loaded. push:
 * the control, a block put in above the page's title once the observer is watching (and taken out after).
 */
const layoutShifts = ({ buffered = false, push = false } = {}) =>
  page.evaluate(
    ({ buffered, push }) =>
      new Promise((ok) => {
        const seen = [];
        new PerformanceObserver((list) => seen.push(...list.getEntries().filter((e) => !e.hadRecentInput).map((e) => e.value))).observe({ type: "layout-shift", buffered });
        const block = push ? Object.assign(document.createElement("div"), { style: "height: 160px" }) : null;
        if (block) document.querySelector('[data-part="page-title"], h1')?.before(block);
        setTimeout(() => (block?.remove(), ok(seen.reduce((a, b) => a + b, 0))), 500);
      }),
    { buffered, push },
  );

await stage("the choice: Lexicommons AI, drawn with the page (no layout shift)", async () => {
  // Loaded fresh on this page, so the shifts counted are its own.
  await page.goto(`${BASE}/app/#practice/new/conversation`);
  await page.reload();
  await page.getByText("Who you'll practice with").waitFor();
  await page.waitForTimeout(1200); // the reads behind it come back
  const total = await layoutShifts({ buffered: true });
  const selected = await page.locator('[aria-pressed="true"]', { hasText: "Lexicommons AI" }).count();
  await shot("02-choice");
  assert(selected === 1, `Lexicommons AI chosen (${selected})`);
  assert(await page.getByText("Then tell your AI").isHidden(), "no word of telling an AI app");
  // Control: something pushing the page down is seen.
  const control = await layoutShifts({ push: true });
  assert(control > 0, `the control's push wasn't seen (${control})`);
  assert(total === 0, `layout shift ${total}`);
  return `chosen; layout shift ${total} (the control's push: ${control.toFixed(3)})`;
});

await stage("a practice on Lexicommons' key: the opening streams in; the server's request is ZDR, no data collection, low effort, an opaque tag", async () => {
  await page.getByRole("button", { name: "Start" }).click();
  await room().waitFor();
  await page.locator('[data-part="chat-event"]', { hasText: "Lexicommons AI joined" }).waitFor();
  await page.locator('[data-part="chat-line"][data-variant="ai"]').first().waitFor({ timeout: 30_000 });
  if (!REAL) await page.locator('[data-part="chat-line"][data-variant="ai"]', { hasText: "Wat heb je gisteren gedaan?" }).first().waitFor();
  practiceId = await page.evaluate(async () => (await (await fetch("/api/practice")).json()).find((p) => p.state !== "ended")?.id);
  const asked = hostedCalls.filter((c) => c.url === "/api/ai/hosted/reply");
  assert(asked.length >= 1, "asked the server");
  const sent = JSON.parse(asked[0].body);
  assert(Object.keys(sent).sort().join(",") === "after,practice" && sent.practice === practiceId, `the device sent only which practice: ${asked[0].body}`);
  if (!REAL) {
    const chat = provider.chats[0];
    assert(chat.auth === `Bearer ${KEY}`, "the server's key");
    const b = chat.body;
    assert(b.provider?.zdr === true && b.provider?.data_collection === "deny" && b.provider?.require_parameters === true, `routing ${JSON.stringify(b.provider)}`);
    assert(b.model === "openai/gpt-6-luna" && b.reasoning?.effort === "low" && b.stream === true, "model, effort, stream");
    assert(/^[0-9a-f]{32}$/.test(b.user ?? "") && !JSON.stringify(b).includes(userId) && !JSON.stringify(b).includes(NAME), "an opaque tag, nothing of the account");
    assert(/Practicing with someone in Lexicommons/.test(JSON.stringify(b.messages)), "the in-app guide, built on the server");
  }
  assert(outside.length === 0, `the page reached outside: ${outside.slice(0, 3)}`);
  await shot("03-opened");
  return `practice ${practiceId}`;
});

await stage("a typed turn is answered and graded on your line", async () => {
  const before = await replies();
  await say("Gisteren ik ben naar de winkel gegaan");
  if (REAL) {
    await moreReplies(before);
    await shot("04-answered");
    return "answered";
  }
  await page.locator('[data-part="chat-line"][data-state="graded"]').first().waitFor({ timeout: 20_000 });
  await page.locator('[data-part="chat-line"][data-variant="ai"]', { hasText: "Wat heb je daar gekocht?" }).first().waitFor();
  const evidence = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().some((row) => row.concept === "p:v2" && row.outcome === "wrong"));
  assert(evidence, "p:v2 wrong recorded");
  await shot("04-graded");
  return "graded; p:v2 wrong";
});

await stage("the meter: this month's use is what OpenRouter said each call cost; the ledger keeps no words", async () => {
  await page.waitForTimeout(1500); // the last call settles after its stream ends
  const rows = spend("practice");
  const m = await me();
  const sum = rows.reduce((a, r) => a + r.cost_micro, 0);
  assert(rows.length >= 2 && m.plan.ai.spent === sum, `spent ${m.plan.ai.spent} vs ledger ${sum} (${rows.length} calls)`);
  if (!REAL) assert(rows.every((r) => r.cost_micro === COST * 1e6), `each ${COST * 1e6}: ${JSON.stringify(rows)}`);
  const kept = JSON.stringify(d1(`SELECT * FROM ai_usage WHERE user_id = '${safe(userId)}'`)) + JSON.stringify(d1(`SELECT * FROM ai_meter WHERE user_id = '${safe(userId)}'`));
  for (const words of ["Gisteren", "winkel", "gedaan"]) assert(!kept.includes(words), `words kept: ${words}`);
  return `${rows.length} calls, ${sum} micro-dollars ($${(sum / 1e6).toFixed(6)})`;
});

await stage("the month's included AI used up: said in words with no Try again, nothing called; back, the next turn answers", async () => {
  const before = provider.chats.length;
  d1(`UPDATE ai_meter SET spent = allowance WHERE user_id = '${safe(userId)}'`);
  expectRefusals = true;
  await say("Ik heb brood gekocht");
  const line = page.locator('[data-part="chat-event"]', { hasText: "You've used this month's included AI." });
  await line.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await shot("05-used-up");
  assert(provider.chats.length === before, "nothing reached the provider");
  assert((await page.locator('[data-part="chat-typing"]').count()) === 0, "no thinking dots once it's said it can't answer");
  assert(!(await room().getByText(/is thinking/).count()), "the header doesn't say it's thinking");
  assert((await line.getByRole("button").count()) === 0, "no Try again, and no key here to carry on with");
  assert(/It's back on [A-Z][a-z]+\u00a01\./.test(await line.innerText()), "it says when it's back, the month and day kept together");
  expectRefusals = false;
  d1(`UPDATE ai_meter SET spent = 0 WHERE user_id = '${safe(userId)}'`);
  const repliesBefore = await replies();
  await say("En toen ben ik naar huis gegaan");
  await moreReplies(repliesBefore);
  return "used up, then the next turn answered";
});

await stage("End: the summary comes through the server and is saved on this device", async () => {
  await room().getByRole("button", { name: "End", exact: true }).click();
  await page.locator('[data-part="session-summary"]').waitFor({ timeout: 30_000 });
  if (!REAL) await page.getByText("You talked about yesterday").waitFor();
  assert(hostedCalls.some((c) => c.url === "/api/ai/hosted/summary"), "the summary was asked of the server");
  await shot("06-summary");
  spend("summary");
  return "summary";
});

await stage("Translate with AI, through the hook Translate's page will call", async () => {
  const out = await page.evaluate(async () => (await import("/js/ai/hosted.js")).translateWithAi({ from: "en", to: "nl", text: "Good morning, how are you?", learning: "nl" }));
  assert(typeof out.translation === "string" && out.translation.length > 0, JSON.stringify(out));
  if (!REAL) assert(out.translation === TRANSLATION.translation, out.translation);
  spend("translate");
  return out.translation;
});

// A key of your own, played: a FAKE key on this device, and its provider (the page calls it directly) answering here.
const FAKE_KEY = `sk-or-v1-check${randomBytes(24).toString("hex")}`;
const ownChats = [];
const ownProvider = async (route) => {
  const request = route.request();
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-title", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (new URL(request.url()).pathname !== "/api/v1/chat/completions") return route.fulfill({ status: 404, headers: cors, body: "not in the stand-in" });
  const body = JSON.parse(request.postData() ?? "{}");
  ownChats.push({ auth: request.headers().authorization, body });
  const reply = body.response_format?.json_schema?.name === "summary" ? SUMMARY : AGAIN;
  return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "text/event-stream" }, body: sse(reply) });
};

await stage("used up with a key of yours here: Carry on with your own key switches the practice, and the key answers", async () => {
  await context.route("https://openrouter.ai/**", ownProvider);
  await page.evaluate(async (key) => {
    const own = await import("/js/ai/own-key.js");
    const me = await (await fetch("/api/me")).json();
    await own.saveKey(me.user.id, { key });
  }, FAKE_KEY);
  await page.goto(`${BASE}/app/#practice/new/conversation`);
  await page.reload();
  await page.getByText("Who you'll practice with").waitFor();
  await page.getByRole("button", { name: "Lexicommons AI", exact: true }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await room().waitFor();
  await page.locator('[data-part="chat-line"][data-variant="ai"]').first().waitFor({ timeout: 30_000 });
  practiceId = await page.evaluate(async () => (await (await fetch("/api/practice")).json()).find((p) => p.state !== "ended")?.id);
  await page.waitForTimeout(1500); // the opening settles
  d1(`UPDATE ai_meter SET spent = allowance WHERE user_id = '${safe(userId)}'`);
  expectRefusals = true;
  await say("Ik heb brood gekocht");
  const line = page.locator('[data-part="chat-event"]', { hasText: "You've used this month's included AI." });
  await line.waitFor({ timeout: 15_000 });
  const carry = room().getByRole("button", { name: "Carry on with your own key" });
  await carry.waitFor();
  await shot("07-carry-on");
  const hostedBefore = hostedCalls.length;
  const repliesBefore = await replies();
  await carry.click();
  await page.locator('[data-part="chat-event"]', { hasText: "GPT-6 Luna joined" }).waitFor({ timeout: 15_000 });
  await moreReplies(repliesBefore);
  expectRefusals = false;
  assert(ownChats.length >= 1 && ownChats.every((c) => c.auth === `Bearer ${FAKE_KEY}`), `the key's provider answered (${ownChats.length})`);
  assert(ownChats.every((c) => c.body.provider?.zdr === true && c.body.provider?.data_collection === "deny"), "with ZDR and no data collection");
  assert(hostedCalls.length === hostedBefore, "no call to the plan's AI after the switch");
  const meta = await page.evaluate(async (id) => (await (await fetch(`/api/practice/${id}?after=0`)).json()).practice, practiceId);
  assert(meta.engine === "own-key" && meta.client === "GPT-6 Luna", `the practice is the key's now: ${JSON.stringify({ engine: meta.engine, client: meta.client })}`);
  await shot("08-carried-on");
  // End it (its summary from the key too), then the key goes and the month comes back.
  await room().getByRole("button", { name: "End", exact: true }).click();
  await page.locator('[data-part="session-summary"]').waitFor({ timeout: 30_000 });
  assert(hostedCalls.length === hostedBefore, "the summary came from the key, not the plan");
  await page.evaluate(async () => {
    const own = await import("/js/ai/own-key.js");
    const me = await (await fetch("/api/me")).json();
    await own.forgetKey(me.user.id);
  });
  await context.unroute("https://openrouter.ai/**", ownProvider);
  d1(`UPDATE ai_meter SET spent = 0 WHERE user_id = '${safe(userId)}'`);
  return `switched; ${ownChats.length} calls to the key's provider, none to the plan's after`;
});

await stage("the plan ends: Practice isn't offered, and the server refuses its AI", async () => {
  d1(`UPDATE billing_subscriptions SET status = 'canceled', ended_at = ${Date.now()}, updated_at = ${Date.now()} WHERE user_id = '${safe(userId)}'`);
  await page.goto(`${BASE}/app/#ai`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.goto(`${BASE}/app/#practice`);
  await page.getByRole("button", { name: "Connect your AI" }).waitFor();
  assert((await page.getByText(/included in your plan/i).count()) === 0, "no word of the plan");
  expectRefusals = true;
  const status = await page.evaluate(async () => (await fetch("/api/ai/hosted/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: "en", to: "nl", text: "hello" }) })).status);
  expectRefusals = false;
  assert(status === 402, `status ${status}`);
  return "402";
});

await stage("no console errors, and nothing from the page left this server", async () => {
  assert(!problems.length, problems.slice(0, 5).join(" | "));
  assert(outside.length === 0, outside.slice(0, 3).join(", "));
  return "none";
});

await stage("delete the test account", async () => {
  const status = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
  assert(status === 200, `delete ${status}`);
  assert(d1(`SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = '${safe(userId)}'`)[0].n === 0, "the ledger went with the account");
  return "deleted, ledger with it";
});

await browser.close();
standin.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, real: REAL, at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results, problems, providerRequests: provider.chats.length }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
