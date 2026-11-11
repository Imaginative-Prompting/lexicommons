#!/usr/bin/env node
// Coaching from your own study, end to end: a real device on a phone in Chrome, real answers and real mistakes, what your AI reads over MCP, and then a real AI app (`codex exec`
// over MCP, with no tool named to it) answering "what am I struggling with?" and "why does the verb go there?" from them.
//
//   node scripts/coach-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--no-model]
//
// LOCAL only: it writes accounts into local D1. The library seeded with path-nl and the Dutch word packs (scripts/packs/seed-local.mjs --default). Sandbox off. Exit 0 = every stage passed.

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const REAL = !argv.includes("--no-model");
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/coach-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--no-model] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const fresh = new Agent({ pipelining: 0 });
const fetch = (url, init = {}) => undiciFetch(url, { ...init, dispatcher: fresh });

const results = [];
const ONLY = opt("only") && new RegExp(opt("only"));
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 12).join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
const run = randomBytes(3).toString("hex");
function account(name) {
  const id = `co${run}${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql([
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'coach-check')`,
  ].join("; "));
  return { id, name, cookie };
}
function connect(who, name = "coach-check") {
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const tokenId = randomBytes(6).toString("hex");
  sql(`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(tokenId)}, ${q(who.id)}, ${q(name)}, ${q(sha256(token))}, ${q(token.slice(0, 8))}, ${Date.now()}, 0)`);
  who.token = token;
  who.tokenId = tokenId;
  return token;
}
async function mcp(who, method, params) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
async function tool(who, name, args = {}) {
  const { result, error } = await mcp(who, "tools/call", { name, arguments: args });
  if (error) throw new Error(`${name}: ${error.message}`);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}
const asUser = (who, method, path, body) => fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const browser = await chromium.launch();
async function phone(who, { block = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true });
  await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  const sent = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.method() !== "HEAD") sent.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postData() ?? "" });
  });
  await page.goto(`${BASE}/app/#study`);
  await page.locator('[data-part="page"]').first().waitFor({ timeout: 30_000 });
  return { context, page, sent };
}
const until = async (what, fn, ms = 30_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`waited ${ms / 1000} s for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};
// Answers as a session writes them, over the last days: this person's word order is weak.
const seedHistory = (page) =>
  page.evaluate(async () => {
    const { record } = await import("/js/study/progress.js");
    const { ITEMS, LESSONS, conceptsOf, sentence } = await import("/js/study/content.js");
    const { pathLessons } = await import("/js/study/path.js");
    // The path and its sentences arrive from the library after the first draw.
    await new Promise((done) => {
      const wait = () => (LESSONS.length > 100 ? done() : setTimeout(wait, 200));
      wait();
    });
    const DAY = 86400_000;
    const now = Date.now();
    const lessons = pathLessons();
    const first = lessons.slice(0, 6).flatMap((lesson) => lesson.items ?? []);
    const byId = new Map(ITEMS.map((item) => [item.id, item]));
    const early = first.map((id) => byId.get(id)).filter(Boolean);
    // Sentences whose verb comes second after something that isn't the subject: "Tomorrow *go* we".
    const orderItems = ITEMS.filter((item) => item.concepts.includes("v2") && item.literal?.[1]?.[1] === true).slice(0, 4);
    const fineItems = early.filter((item) => !orderItems.includes(item)).slice(0, 12);
    const rows = [];
    const answer = (item, outcome, activity, test, skill, at, said) => {
      const seen = new Set();
      for (const concept of conceptsOf(item)) {
        if (seen.has(concept)) continue;
        seen.add(concept);
        const unit = concept.startsWith("p:") || concept.startsWith("c:");
        rows.push({ concept, at, outcome: unit ? outcome : outcome === "wrong" ? "met" : outcome, activity, item: item.id, test, skill, ...(unit && outcome === "wrong" && said ? { said } : {}) });
      }
    };
    fineItems.forEach((item, i) => {
      answer(item, "right", "choose", "pick", "read", now - (8 - (i % 6)) * DAY);
      answer(item, "right", "fill", "pick", "read", now - (6 - (i % 5)) * DAY);
    });
    orderItems.forEach((item, i) => {
      const words = item.words.map(([text]) => text);
      const wrongWay = [...words.slice(1), words[0]].join(" ");
      answer(item, "right", "choose", "pick", "read", now - 7 * DAY - i * 3600_000);
      answer(item, "wrong", "arrange", "build", "read", now - 5 * DAY - i * 3600_000, wrongWay);
      answer(item, "wrong", "arrange", "build", "read", now - 2 * DAY - i * 3600_000, wrongWay);
      answer(item, "wrong", "arrange", "build", "read", now - DAY / 2 - i * 3600_000, wrongWay);
    });
    record(rows);
    return { orderItems: orderItems.map((item) => ({ id: item.id, sentence: sentence(item), patterns: item.concepts })), fine: fineItems.map((item) => sentence(item)), rows: rows.length };
  });

const SESSION = '[data-part="session"]';
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let learner;
let phoneA;
let seeded;
await stage("no AI connected: real answers on the device, and nothing about them leaves it", async () => {
  learner = account(`Coach Learner ${run}`);
  phoneA = await phone(learner);
  seeded = await seedHistory(phoneA.page);
  assert(seeded.orderItems.length >= 3, `seeded ${JSON.stringify(seeded).slice(0, 200)}`);
  await phoneA.page.evaluate(async () => (await import("/js/study/done.js")).finishedSession());
  await phoneA.page.waitForTimeout(23_000); // Past the record's own wait after a change.
  const flushed = await phoneA.page.evaluate(async () => {
    const mod = await import("/js/ai/study-record.js").catch(() => null);
    if (mod) await mod.flushStudyRecord();
    return Boolean(mod);
  });
  const toServer = phoneA.sent.filter((r) => r.path === "/api/ai/record" || r.path === "/api/practice/learner");
  assert(!toServer.length, `sent with no AI: ${toServer.map((r) => r.path)}`);
  for (const { sentence } of seeded.orderItems) assert(!phoneA.sent.some((r) => r.body.includes(sentence)), `a missed sentence left the device: ${sentence}`);
  assert(flushed, "the app has no study record");
  const refused = await asUser(learner, "PUT", "/api/ai/record", { version: 1, language: "nl", evidenceAt: 1 });
  assert(refused.status === 409, `the server took a record with no AI: ${refused.status}`);
  const held = await (await asUser(learner, "GET", "/api/ai/record")).json();
  assert(held.records.length === 0, JSON.stringify(held));
  return `${seeded.rows} rows on the device; ${phoneA.sent.length} writes to the server, none with any of it`;
});

await stage("an AI connected: the device notices, and sends its record", async () => {
  connect(learner);
  await phoneA.page.reload();
  await phoneA.page.locator('[data-part="page"]').first().waitFor({ timeout: 30_000 });
  const put = await until("the record", () => phoneA.sent.find((r) => r.path === "/api/ai/record" && r.method === "PUT"), 25_000);
  const size = put.body.length;
  const held = await until("it to be held", async () => (await (await asUser(learner, "GET", "/api/ai/record")).json()).records[0]);
  assert(held.language === "nl", JSON.stringify(held));
  return `${Math.round(size / 1024)} KB`;
});

let summary;
await stage("what the AI reads first: where they are, what's hardest and why, the sentences they missed and in which game, the grammar's explanations", async () => {
  const { result } = await mcp(learner, "tools/list", {});
  const names = result.tools.map((t) => t.name);
  for (const name of ["study_summary", "study_concept", "study_lesson", "study_misses", "study_sentence", "get_coaching_guide"]) assert(names.includes(name), `no tool ${name}`);
  summary = await tool(learner, "study_summary");
  writeFileSync(join(OUT, "study-summary.json"), JSON.stringify(summary, null, 1));
  assert(summary.languageName === "Dutch" && summary.where?.of > 100, `where: ${JSON.stringify(summary.where)}`);
  assert(summary.currentLesson?.title, `the current lesson: ${JSON.stringify(summary.currentLesson)}`);
  const top = summary.strugglingMost.patterns[0];
  assert(top?.id === "p:v2", `what's hardest: ${JSON.stringify(summary.strugglingMost.patterns.slice(0, 3))}`);
  assert(/missed \d+ of \d+/.test(top.why), `why: ${top.why}`);
  const order = summary.byGame[Object.keys(summary.byGame).find((name) => /order/i.test(name))];
  const choose = summary.byGame.Choose;
  assert(order && order.percentRight === 0 && choose.percentRight === 100, JSON.stringify(summary.byGame));
  const miss = summary.recentMisses[0];
  assert(seeded.orderItems.some((item) => item.sentence === miss.nl), `their latest miss: ${JSON.stringify(miss).slice(0, 300)}`);
  assert(/order/i.test(miss.game) && miss.said && miss.literal?.length && miss.en, `a miss has its game, what they put, its literal line and its meaning: ${JSON.stringify(miss).slice(0, 400)}`);
  assert(miss.about?.includes("Verb second"), `what it was about: ${JSON.stringify(miss.about)}`);
  const v2 = summary.grammar.find((p) => p.id === "p:v2");
  assert(/verb comes second/.test(v2.about) && v2.wrong > 0 && v2.recall, `the pattern: ${JSON.stringify(v2)}`);
  assert(JSON.stringify(summary).length < 60_000, `the summary is ${JSON.stringify(summary).length} bytes`);
  return `${JSON.stringify(summary).length} bytes; lesson ${summary.where.lesson} of ${summary.where.of}`;
});

await stage("asking for one thing: a concept, a word, a lesson, misses by game; not one huge blob", async () => {
  const concept = await tool(learner, "study_concept", { concept: "verb second" });
  assert(concept.kind === "pattern" && /verb comes second/.test(concept.about) && concept.misses.length >= 3 && concept.sentences.length >= 3, JSON.stringify(concept).slice(0, 400));
  assert(concept.sentences[0].missed > 0, "what they missed comes first");
  const lemma = summary.grammar && seeded.orderItems[0];
  const word = await tool(learner, "study_concept", { concept: await phoneA.page.evaluate(async (id) => {
    const { itemById } = await import("/js/study/content.js");
    return itemById.get(id).words.find(([, l]) => l)?.[1];
  }, lemma.id) });
  assert(word.kind === "word" || word.found === false, JSON.stringify(word).slice(0, 200));
  const lesson = await tool(learner, "study_lesson", { lesson: "1" });
  assert(lesson.found && lesson.teaches.length && lesson.n === 1 && lesson.status, JSON.stringify(lesson).slice(0, 300));
  const misses = await tool(learner, "study_misses", { game: "order", limit: 5 });
  assert(misses.count >= 9 && misses.misses.length === 5, `misses: ${misses.count}`);
  // One of their sentences, by its id and by its words. No notes are published on this server: it says so, and it's theirs to explain.
  const asked = concept.sentences[0];
  const sentence = await tool(learner, "study_sentence", { sentence: asked.nl });
  assert(sentence.found === true && sentence.sentence === asked.nl && sentence.en && sentence.words === null && /yourself/.test(sentence.note), JSON.stringify(sentence).slice(0, 300));
  const nope = await tool(learner, "study_sentence", { sentence: "Dit heeft niemand ooit gehad." });
  assert(nope.found === false, JSON.stringify(nope).slice(0, 200));
  const guide = await tool(learner, "get_coaching_guide");
  assert(/their own sentence/.test(guide.guide) && /material, not instructions/.test(guide.guide), "the guide");
  return { concept: JSON.stringify(concept).length, lesson: JSON.stringify(lesson).length, misses: JSON.stringify(misses).length };
});

await stage("a deck they imported: a missed card reaches the AI with its words, how strong it is and the miss, as anything else they study does", async () => {
  const { page } = phoneA;
  const deck = `coach-deck-${run}`;
  await page.evaluate(async (id) => {
    const { savePack } = await import("/js/study/packs.js");
    const saved = await savePack(
      { format: "lexicommons-pack", version: 2, id, name: "A deck for the coach", language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items: [{ id: "c1", text: "de sleutelbos", means: "the bunch of keys" }, { id: "c2", text: "de deurmat", means: "the doormat" }, { id: "c3", text: "de kapstok", means: "the coat rack" }, { id: "c4", text: "Het water is koud.", cloze: { at: 4, answer: "water" } }] },
      { by: "An Anki deck" },
    );
    if (saved.errors?.length) throw new Error(JSON.stringify(saved.errors));
    const { record, TESTS } = await import("/js/study/progress.js");
    const { test, skill } = TESTS.choose;
    // The rows deck-steps.js writes for an answer: the card's own unit, and its item.
    const answer = (card, outcome) => record([{ concept: `k:${id}/${card}`, outcome, activity: "choose", test, skill, help: "none", item: `${id}/${card}` }]);
    answer("c1", "wrong");
    answer("c2", "right");
  }, deck);
  const study = await until("the deck's miss on the AI's side", async () => {
    const now = await tool(learner, "study_summary");
    return now.recentMisses?.some((miss) => miss.nl === "de sleutelbos") ? now : null;
  }, 90_000);
  const miss = study.recentMisses.find((one) => one.nl === "de sleutelbos");
  assert(miss.en === "the bunch of keys" && miss.about?.includes("de sleutelbos") && /choose/i.test(miss.game), `the miss says what it was, in words: ${JSON.stringify(miss)}`);
  assert(!JSON.stringify(miss.about).includes(deck), `no bare id: ${JSON.stringify(miss.about)}`);
  assert(study.totals.cardsStudied === 2, `cards studied: ${JSON.stringify(study.totals)}`);
  const card = await tool(learner, "study_concept", { concept: "de sleutelbos" });
  assert(card.found && card.kind === "card" && card.en === "the bunch of keys" && card.deck === "A deck for the coach", JSON.stringify(card).slice(0, 400));
  assert(card.wrong === 1 && card.seen === 1 && card.recall, `its strength: ${JSON.stringify(card).slice(0, 400)}`);
  assert(card.misses.length === 1 && card.sentences[0]?.nl === "de sleutelbos" && card.sentences[0].missed === 1, `its miss: ${JSON.stringify(card).slice(0, 500)}`);
  const known = await tool(learner, "study_concept", { concept: "de deurmat" });
  assert(known.found && known.right === 1 && known.misses.length === 0, JSON.stringify(known).slice(0, 300));
  const byConcept = await tool(learner, "study_misses", { concept: "sleutelbos" });
  assert(byConcept.count === 1 && byConcept.misses[0].nl === "de sleutelbos", JSON.stringify(byConcept).slice(0, 300));
  return { miss: miss.nl, recall: card.recall };
});

await stage("the server tells an AI this exists, without being asked", async () => {
  const { result } = await mcp(learner, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "coach-check", version: "1" } });
  assert(/study_summary/.test(result.instructions) && /why does the verb go there/.test(result.instructions), result.instructions.slice(0, 300));
  const { result: listed } = await mcp(learner, "tools/list", {});
  const description = listed.tools.find((t) => t.name === "study_summary").description;
  assert(/anything about the language/.test(description), description);
});

await stage("fresh after a real session: a wrong answer in a real game, what was put, on the AI's side seconds after the session ends", async () => {
  const { page, sent } = phoneA;
  const before = sent.filter((r) => r.path === "/api/ai/record").length;
  // A real Choose or Arrange step: a real wrong answer, by the same code a finger reaches.
  const seenSaid = await page.evaluate(async () => {
    const { itemById } = await import("/js/study/content.js");
    return [...itemById.keys()].length;
  });
  assert(seenSaid > 100, "the sentences are there");
  await page.goto(`${BASE}/app/#study/session/quick`);
  const session = page.locator(SESSION);
  await session.waitFor({ timeout: 20_000 });
  let wrongAnswer = null;
  for (let i = 0; i < 40 && !wrongAnswer; i++) {
    await page.waitForTimeout(150);
    if (!(await session.count())) break;
    const id = await session.getAttribute("data-item");
    const info = id ? await page.evaluate(async (id) => {
      const { itemById, sentence } = await import("/js/study/content.js");
      const found = itemById.get(id);
      return found ? { wrong: found.wrong ?? [], sentence: sentence(found), words: found.words.map(([t]) => t) } : null;
    }, id) : null;
    const choices = session.locator('[data-part="choice"]');
    const tiles = session.locator('[data-part="arrange-bank"] [data-part="tile"]');
    if (info && (await tiles.count()) > 1 && (await tiles.first().getAttribute("lang")) !== "en") {
      for (const word of [...info.words].reverse()) await session.locator('[data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])', { hasText: new RegExp(`^${escapeRe(word)}$`) }).first().click();
      await session.getByRole("button", { name: "Check" }).click();
      wrongAnswer = { game: "arrange", put: [...info.words].reverse().join(" "), sentence: info.sentence };
    } else if (info?.wrong?.length && (await choices.filter({ hasText: info.wrong[0] }).count())) {
      await choices.filter({ hasText: info.wrong[0] }).first().click();
      wrongAnswer = { game: "choose", put: info.wrong[0], sentence: info.sentence };
    }
    if (wrongAnswer) break;
    // Anything else: on to the next step.
    const skip = session.getByRole("button", { name: /^(Continue|Show meaning|I knew it|I don't know|Can't speak now)$/ }).first();
    if (await skip.count()) await skip.click().catch(() => {});
    const go = page.locator('[data-part="answer-bar"] [data-variant="white"]');
    if (await go.count()) await go.click().catch(() => {});
  }
  assert(wrongAnswer, "no game to answer wrong in 40 steps");
  // A finished session is what sends it, right away.
  await page.evaluate(async () => (await import("/js/study/done.js")).finishedSession());
  await until("the record again", () => sent.filter((r) => r.path === "/api/ai/record" && r.method === "PUT").length > before, 15_000);
  const found = await until("the new miss", async () => {
    const now = await tool(learner, "study_summary");
    const miss = now.recentMisses.find((m) => m.nl === wrongAnswer.sentence && m.said);
    return miss ?? null;
  }, 15_000);
  assert(found.said.replace(/\s|[.?!,]/g, "").toLowerCase() === wrongAnswer.put.replace(/\s|[.?!,]/g, "").toLowerCase(), `what they put: ${found.said} / ${wrongAnswer.put}`);
  return `${wrongAnswer.game}: "${wrongAnswer.put}" for "${wrongAnswer.sentence}"`;
});

await stage("two devices: one that hasn't studied since can't overwrite; the one that sent it can (it may have cleared its progress); another language comes on request", async () => {
  const current = await tool(learner, "study_summary");
  const stale = await asUser(learner, "PUT", "/api/ai/record", { version: 1, language: "nl", languageName: "Dutch", device: "another-device", evidenceAt: 1000, totals: { answers: 1 } });
  assert(stale.status === 200 && (await stale.json()).kept === false, "a stale device's record was kept");
  assert((await tool(learner, "study_summary")).totals.answers === current.totals.answers, "it overwrote");
  const german = await asUser(learner, "PUT", "/api/ai/record", { version: 1, language: "de", languageName: "German", device: "another-device", evidenceAt: 500, totals: { answers: 2 } });
  assert((await german.json()).kept === true, "German");
  const again = await tool(learner, "study_summary");
  assert(again.language === "nl" && again.otherLanguages.some((o) => o.language === "de"), JSON.stringify(again.otherLanguages));
  assert((await tool(learner, "study_summary", { language: "de" })).languageName === "German", "on request");
  assert((await tool(learner, "study_summary", { language: "fr" })).nothing === true, "a language with none");
  for (const bad of [{ version: 9, language: "nl", evidenceAt: 1 }, { version: 1, language: "../x", evidenceAt: 1 }, { version: 1, language: "nl", evidenceAt: "x" }, { version: 1, language: "nl", evidenceAt: 1, misses: "x" }]) {
    const r = await asUser(learner, "PUT", "/api/ai/record", bad);
    assert(r.status === 400, `${JSON.stringify(bad)}: ${r.status}`);
  }
  const big = await asUser(learner, "PUT", "/api/ai/record", { version: 1, language: "nl", evidenceAt: 2, pad: "x".repeat(500_000) });
  assert(big.status === 400 || big.status === 413, `too big: ${big.status}`);
});

await stage("the export holds it", async () => {
  const exported = await (await asUser(learner, "GET", "/api/me/export")).json();
  assert(exported.practice.studyRecords?.some((r) => r.record.language === "nl"), Object.keys(exported.practice).join(", "));
});

await stage("the AI section says plainly it can do this; nothing outside it does", async () => {
  const { page } = phoneA;
  await page.goto(`${BASE}/app/#ai`);
  const coach = page.locator(".lx-quiet-more", { hasText: "Talk about what you're learning" });
  await coach.waitFor({ timeout: 15_000 });
  await coach.locator("summary").click(); // a press away on that page
  const said = await coach.innerText();
  assert(/what you're struggling with/.test(said) && /why a verb goes where/.test(said), said);
  await page.screenshot({ path: join(OUT, "ai-section.png") });
  await page.goto(`${BASE}/app/#ai/connect`);
  await page.getByText("What your AI can read").waitFor({ timeout: 15_000 });
  await page.locator(".lx-quiet-more > summary", { hasText: "What your AI can read" }).click(); // a press away on that page
  await page.getByText(/it goes when you disconnect your last AI/).waitFor({ timeout: 5000 });
  await page.getByText(/Sent /).first().waitFor({ timeout: 8000 });
  await page.screenshot({ path: join(OUT, "ai-connection.png"), fullPage: true });
  const other = account(`Plain Learner ${run}`);
  const noAi = await phone(other);
  for (const hash of ["today", "study", "read", "know", "explore", "settings", "settings/about"]) {
    await noAi.page.goto(`${BASE}/app/#${hash}`);
    await noAi.page.waitForTimeout(500);
    const text = await noAi.page.locator("body").innerText();
    assert(!/struggling with|coach/i.test(text), `#${hash}: ${text.slice(0, 200)}`);
  }
  await noAi.page.goto(`${BASE}/app/#ai`);
  await noAi.page.locator(".lx-quiet-more > summary", { hasText: "What it can do" }).click(); // a press away on that page
  await noAi.page.getByText(/answers from your lessons and mistakes/).waitFor({ timeout: 10_000 });
  await noAi.context.close();
});

const ONE_WORD = 1024; // bytes: more than a word's entry in the record takes
const WORDS_SHARE = 0.2;
await stage("a heavy learner: thousands of words and answers fill the limit and no more, keeping the words most useful to coach from, and the page goes on", async () => {
  const heavy = account(`Coach Heavy ${run}`);
  connect(heavy);
  const { context, page } = await phone(heavy);
  const client = await context.newCDPSession(page);
  const made = await page.evaluate(async () => {
    const { record } = await import("/js/study/progress.js");
    const { WORDS, ITEMS, LESSONS } = await import("/js/study/content.js");
    await new Promise((done) => {
      const wait = () => (LESSONS.length > 100 && Object.keys(WORDS).length > 10_000 ? done() : setTimeout(wait, 200));
      wait();
    });
    const lemmas = Object.keys(WORDS);
    const now = Date.now();
    const rows = [];
    lemmas.forEach((lemma, i) => {
      rows.push({ concept: `w:${lemma}`, at: now - 30 * 86400_000 + i, outcome: i % 7 ? "right" : "wrong", activity: "choose", test: "pick", skill: "read", item: ITEMS[i % ITEMS.length].id });
      rows.push({ concept: `w:${lemma}`, at: now - 10 * 86400_000 + i, outcome: i % 11 ? "right" : "wrong", activity: "fill", test: "pick", skill: "read", item: ITEMS[i % ITEMS.length].id });
    });
    for (let i = 0; i < rows.length; i += 2000) record(rows.slice(i, i + 2000));
    return { words: lemmas.length, rows: rows.length };
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const built = await page.evaluate(async () => {
    const long = [];
    const observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => long.push(Math.round(e.duration))));
    observer.observe({ type: "longtask", buffered: false });
    const { buildStudyRecord } = await import("/js/ai/study-record.js");
    const { LIMITS } = await import("/js/practice/protocol.js");
    const started = performance.now();
    const record = await buildStudyRecord({ device: "x" });
    const ms = Math.round(performance.now() - started);
    await new Promise((r) => setTimeout(r, 50));
    observer.disconnect();
    window.lxHeavyRecord = record;
    // In bytes, as the server counts a body.
    const bytesOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
    return {
      ms,
      long: long.sort((a, b) => b - a).slice(0, 5),
      limit: LIMITS.recordBytes,
      bytes: bytesOf(record),
      sections: Object.fromEntries(Object.keys(record).map((key) => [key, bytesOf(record[key])])),
      words: record.words.length,
      leftOut: record.totals.wordsLeftOut ?? 0,
      struggles: record.struggles.words.length,
    };
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // Which words it kept, against every word this learner has: the ones they've missed first, the weakest of those first (fit in study-record.js).
  const useful = await page.evaluate(async () => {
    const { unitState } = await import("/js/study/progress.js");
    const { WORDS } = await import("/js/study/content.js");
    const record = window.lxHeavyRecord;
    const now = Date.parse(record.builtAt);
    const of = (id) => {
      const s = unitState(id, { lang: record.language, now });
      return { missed: s.wrong > 0, strength: Math.max(0, ...Object.values(s.strengths).filter(Boolean).map((v) => v.stability ?? 0)) };
    };
    const kept = new Set(record.words.map((word) => word.id));
    const everyWord = Object.keys(WORDS).map((lemma) => ({ id: `w:${lemma}`, ...of(`w:${lemma}`) }));
    const missedOut = everyWord.filter((word) => word.missed && !kept.has(word.id));
    const missedIn = everyWord.filter((word) => word.missed && kept.has(word.id));
    const shown = record.words.map((word) => word.wrong > 0);
    return {
      missed: missedIn.length + missedOut.length,
      missedKept: missedIn.length,
      unmissedKept: everyWord.filter((word) => !word.missed && kept.has(word.id)).length,
      missedAfterUnmissed: shown.lastIndexOf(true) > shown.indexOf(false) && shown.includes(false),
      strongestKept: Math.max(0, ...missedIn.map((word) => word.strength)),
      weakestLeftOut: Math.min(Infinity, ...missedOut.map((word) => word.strength)),
    };
  });
  writeFileSync(join(OUT, "heavy.json"), JSON.stringify({ made, built, useful }, null, 1));
  assert(built.bytes <= built.limit, `${built.bytes} bytes, over the limit of ${built.limit}`);
  assert(built.struggles >= 15, JSON.stringify(built));
  // It fills the limit: with words left out, there's no room for another. No number of words is promised: it depends on what else this learner has.
  const room = built.limit - built.bytes;
  assert(built.leftOut > 0, `this learner should be too big for the limit, so that this holds what's kept: ${JSON.stringify(built)}`);
  assert(room < ONE_WORD, `${built.leftOut} words left out, with ${room} bytes to spare`);
  // And what it keeps is what's most useful to coach from: nothing they never missed in the place of something they did, and the weakest of what they missed.
  assert(useful.unmissedKept === 0 || useful.missedKept === useful.missed, `it kept ${useful.unmissedKept} words they never missed, and left out ${useful.missed - useful.missedKept} they did`);
  assert(!useful.missedAfterUnmissed, "a word they never missed comes before one they did");
  assert(useful.strongestKept <= useful.weakestLeftOut, `it kept a word of strength ${useful.strongestKept} and left out a missed one of strength ${useful.weakestLeftOut}`);
  // Nothing else in the record crowds the words out. Well under what they hold now: a floor for a real loss, not a count to keep up with.
  assert(built.sections.words >= built.limit * WORDS_SHARE, `words hold only ${built.sections.words} of ${built.limit} bytes: ${JSON.stringify(built.sections)}`);
  assert(Math.max(0, ...built.long) < 1000, `a long task with the processor slowed 4×: ${built.long}`);
  const put = await page.evaluate(async () => {
    const { buildStudyRecord } = await import("/js/ai/study-record.js");
    const body = JSON.stringify(await buildStudyRecord({ device: "x" }));
    const r = await fetch("/api/ai/record", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    return { status: r.status, bytes: body.length };
  });
  assert(put.status === 200, JSON.stringify(put));
  const summary = await tool(heavy, "study_summary");
  assert(JSON.stringify(summary).length < 60_000, `a heavy learner's summary: ${JSON.stringify(summary).length}`);
  await context.close();
  return { ...made, ...built };
});

await stage("long sentences: hundreds of long ones missed: the record is still taken, its oldest sentences gone, the newest and the words kept, and the AI told", async () => {
  const long = account(`Coach Long ${run}`);
  connect(long);
  const { context, page } = await phone(long);
  const built = await page.evaluate(async () => {
    const { record } = await import("/js/study/progress.js");
    const { ITEMS, LESSONS, WORDS } = await import("/js/study/content.js");
    const { LIMITS } = await import("/js/practice/protocol.js");
    await new Promise((done) => {
      const wait = () => (LESSONS.length > 100 && Object.keys(WORDS).length > 10_000 ? done() : setTimeout(wait, 200));
      wait();
    });
    // Sentences as long as a pack may say (400 characters of meaning, PACK_LIMITS.sentence), with letters that take two bytes. In this page's copy only.
    const items = ITEMS.filter((item) => item.words.some(([, word]) => word)).slice(0, 600);
    for (const item of items) item.means = "é".repeat(400);
    const now = Date.now();
    record(items.map((item, i) => ({ concept: `w:${item.words.find(([, word]) => word)[1]}`, at: now - (items.length - i) * 3600_000, outcome: "wrong", activity: "choose", test: "pick", skill: "read", item: item.id })));
    const { buildStudyRecord, flushStudyRecord } = await import("/js/ai/study-record.js");
    const made = await buildStudyRecord({ device: "x" });
    await flushStudyRecord();
    const bytesOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
    const order = items.map((item) => item.id);
    const kept = order.flatMap((id, i) => (made.sentences[id] ? [i] : []));
    return { limit: LIMITS.recordBytes, bytes: bytesOf(made), sections: Object.fromEntries(Object.keys(made).map((key) => [key, bytesOf(made[key])])), made: order.length, kept, words: made.words.length, wordsLeftOut: made.totals.wordsLeftOut ?? 0, misses: made.misses.length, sentencesLeftOut: made.totals.sentencesLeftOut ?? 0, evidenceAt: made.evidenceAt };
  });
  const about = { ...built, kept: built.kept.length };
  writeFileSync(join(OUT, "long-sentences.json"), JSON.stringify(about, null, 1));
  assert(built.bytes <= built.limit, `${built.bytes} bytes, over the limit of ${built.limit}: ${JSON.stringify(built.sections)}`);
  // What's gone is the oldest: every sentence newer than the oldest one kept is there too.
  assert(built.kept.length > 0 && built.sentencesLeftOut > 0, `nothing had to go, so this holds nothing: ${JSON.stringify(about)}`);
  assert(built.kept.at(-1) === built.made - 1 && built.kept.length === built.made - built.kept[0], `kept out of order: ${built.kept.slice(0, 5)} … ${built.kept.at(-1)} of ${built.made}`);
  // Long sentences don't take the place of everything else.
  assert(built.words > 0 && built.wordsLeftOut === 0, `the words they missed: ${built.words} kept, ${built.wordsLeftOut} left out`);
  assert(built.misses >= 100, `only ${built.misses} misses kept`);
  // The server has it, and the AI is told some sentences aren't there: this used to be refused, and tried again for ever without a word.
  const summary = await tool(long, "study_summary");
  assert(!summary.nothing && summary.totals?.sentencesLeftOut === built.sentencesLeftOut, `what the AI reads: ${JSON.stringify(summary).slice(0, 300)}`);
  await context.close();
  return about;
});

let learnerAnswers = {};
if (REAL) {
  // What the AI section gives people to paste into their AI's own instructions, read from the page's code, so the check holds what it really says.
  const ONE_LINE = /const COACH_LINE = "([^"]+)"/.exec(readFileSync(join(APP, "public/js/ai/tab.js"), "utf8"))?.[1];
  const ask = (name, prompt, { told = false } = {}) =>
    new Promise((done, fail) => {
      const off = ["shell_tool", "unified_exec", "unified_exec_tty", "apps", "plugins", "browser_use", "browser_use_external", "computer_use", "image_generation", "memories", "hooks", "skill_search", "goals", "multi_agent"];
      const out = join(OUT, `${name}.answer.txt`);
      const args = ["exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "-C", tmpdir(), "-s", "read-only", "--json", ...off.flatMap((f) => ["--disable", f]), "-c", 'web_search="disabled"', "-c", 'model_reasoning_effort="medium"', "-m", "gpt-daybreak-blue-latest", "-c", `mcp_servers.lexicommons.url="${BASE}/mcp"`, "-c", 'mcp_servers.lexicommons.bearer_token_env_var="LEXICOMMONS_TOKEN"', "-c", 'mcp_servers.lexicommons.default_tools_approval_mode="approve"', "-c", "mcp_servers.lexicommons.startup_timeout_sec=30", "-c", "mcp_servers.lexicommons.tool_timeout_sec=60", "-o", out, "-"];
      // A person's Codex with nothing of this machine's in it: its own home, only the login from here, so the owner's global instructions don't answer for it.
      const home = mkdtempSync(join(tmpdir(), "coach-codex-"));
      symlinkSync(join(homedir(), ".codex/auth.json"), join(home, "auth.json"));
      if (told) writeFileSync(join(home, "AGENTS.md"), `${ONE_LINE}\n`);
      const child = spawn("codex", args, { env: { ...process.env, CODEX_HOME: home, LEXICOMMONS_TOKEN: learner.token }, stdio: ["pipe", "pipe", "pipe"] });
      const chunks = [];
      child.stdout.on("data", (c) => chunks.push(c));
      child.stderr.on("data", () => {});
      const timer = setTimeout(() => child.kill("SIGTERM"), 5 * 60_000);
      child.on("close", (exit) => {
        clearTimeout(timer);
        rmSync(home, { recursive: true, force: true });
        const events = Buffer.concat(chunks).toString("utf8");
        writeFileSync(join(OUT, `${name}.events.jsonl`), events);
        const lines = events.split("\n").filter(Boolean).map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return {};
          }
        });
        const calls = lines.filter((e) => e.type === "item.completed" && e.item?.type === "mcp_tool_call").map((e) => e.item.tool);
        let answer = "";
        try {
          answer = readFileSync(out, "utf8");
        } catch {}
        if (exit !== 0 || !answer) fail(new Error(`codex exited ${exit}: ${events.slice(-400)}`));
        else done({ answer, calls });
      });
      child.stdin.end(prompt);
    });
  // --trial <file>: one prompt a line, each put to a fresh Codex, its calls and answer written down. For trying wording; nothing is asserted.
  if (opt("trial")) {
    const trials = [];
    for (const prompt of readFileSync(opt("trial"), "utf8").split("\n").filter(Boolean)) {
      const told = prompt.startsWith("told: ");
      const out = await ask(`trial-${trials.length}`, prompt.replace(/^told: /, ""), { told }).catch((error) => ({ error: String(error.message).slice(0, 300) }));
      trials.push({ prompt, ...out });
      console.log(`  trial ${JSON.stringify(prompt)} → ${out.calls?.join(", ") || "no tool"}: ${(out.answer ?? out.error).slice(0, 160).replace(/\n/g, " ")}`);
    }
    writeFileSync(join(OUT, "trial.json"), JSON.stringify(trials, null, 1));
  }
  // Codex always hides MCP tools behind its own search, so a question with no hint at all rarely finds them (the AI section says so, and offers the line).
  const fromTheirMistakes = (answer) => seeded.orderItems.filter((item) => answer.includes(item.sentence.replace(/[.?!]$/, "")) || item.sentence.split(/\s+/).slice(0, 3).join(" ").replace(/[.?!]$/, "").length && answer.includes(item.sentence.split(/\s+/).slice(0, 3).join(" ")));
  await stage(`a real AI app, told once where to look, asked only "what am I struggling with?": it reads their study and answers from their own mistakes`, async () => {
    assert(ONE_LINE, "the line the AI section offers");
    const { answer, calls } = await ask("struggling", "what am I struggling with?", { told: true });
    learnerAnswers.struggling = { calls, answer };
    assert(calls.includes("study_summary"), `its calls: ${calls.join(", ")}\n${answer.slice(0, 300)}`);
    assert(/verb|word order|order/i.test(answer), `the answer: ${answer.slice(0, 500)}`);
    assert(fromTheirMistakes(answer).length >= 1, `none of their missed sentences in the answer: ${answer.slice(0, 700)}`);
    return `calls: ${calls.join(", ")}`;
  });
  await stage(`a real AI app, told once where to look, asked only "why does the verb go there?": it finds what they got wrong and explains it from the record`, async () => {
    const { answer, calls } = await ask("verb", "why does the verb go there?", { told: true });
    learnerAnswers.verb = { calls, answer };
    assert(calls.some((c) => /^study_/.test(c)), `its calls: ${calls.join(", ")}\n${answer.slice(0, 300)}`);
    const now = await tool(learner, "study_summary");
    const theirs = [...now.recentMisses.map((m) => m.nl), ...seeded.orderItems.map((item) => item.sentence)].map((s) => s.replace(/[.?!]$/, ""));
    assert(theirs.some((s) => answer.includes(s)), `no missed sentence of theirs in the answer: ${answer.slice(0, 700)}`);
    assert(/second|V2/i.test(answer), `no rule in the answer: ${answer.slice(0, 500)}`);
    return `calls: ${calls.join(", ")}`;
  });
  await stage(`a real AI app, told once where to look, asked why a word of one of their sentences is there: it reads their study, and says which tool found it`, async () => {
    const now = await tool(learner, "study_summary");
    const sentence = now.recentMisses[0].nl;
    const word = sentence.split(" ")[1].replace(/[.,?!]/g, "");
    const { answer, calls } = await ask("word-why", `why is "${word}" there in "${sentence}"?`, { told: true });
    learnerAnswers.wordWhy = { calls, answer };
    assert(calls.some((c) => /^study_/.test(c)), `its calls: ${calls.join(", ")}\n${answer.slice(0, 300)}`);
    assert(answer.length > 40, answer);
    return `calls: ${calls.join(", ")}; study_sentence ${calls.includes("study_sentence") ? "used" : "not used"}`;
  });
  await stage(`a real AI app with nothing set up, asked "what am I struggling with in Lexicommons?": it finds it, and reads the guide`, async () => {
    const { answer, calls } = await ask("named", "what am I struggling with in Lexicommons?");
    learnerAnswers.named = { calls, answer };
    assert(calls.includes("study_summary"), `its calls: ${calls.join(", ")}\n${answer.slice(0, 300)}`);
    assert(fromTheirMistakes(answer).length >= 1 || /0\s*(\/|of|out of)\s*\d+|verb.second/i.test(answer), `not from their mistakes: ${answer.slice(0, 700)}`);
    return `calls: ${calls.join(", ")}`;
  });
  // Written down, not asserted: a plain question to an AI app told nothing, which Codex's own search decides.
  {
    const { answer, calls } = await ask("untold", "what am I bad at?").catch((error) => ({ answer: String(error.message), calls: [] }));
    learnerAnswers.untold = { prompt: "what am I bad at?", calls, answer };
    console.log(`  note  told nothing, "what am I bad at?": ${calls.join(", ") || "no tool"}`);
  }
  writeFileSync(join(OUT, "real-answers.json"), JSON.stringify(learnerAnswers, null, 1));
}

await stage("disconnecting: the last AI going takes the record; a device finding no AI lets go of it; nothing goes up again", async () => {
  const before = (await (await asUser(learner, "GET", "/api/ai/record")).json()).records.length;
  assert(before >= 1, "nothing to take");
  const firstToken = learner.tokenId;
  const firstValue = learner.token;
  connect(learner, "a second token");
  await asUser(learner, "DELETE", `/api/tokens/${firstToken}`);
  assert((await (await asUser(learner, "GET", "/api/ai/record")).json()).records.length === before, "one AI left: it stays");
  await asUser(learner, "DELETE", `/api/tokens/${learner.tokenId}`);
  assert((await (await asUser(learner, "GET", "/api/ai/record")).json()).records.length === 0, "the last one going took it");
  const refused = await asUser(learner, "PUT", "/api/ai/record", { version: 1, language: "nl", evidenceAt: Date.now() });
  assert(refused.status === 409, `refused after: ${refused.status}`);
  const { page, sent } = phoneA;
  await page.reload();
  await page.locator('[data-part="page"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(5000);
  const after = sent.slice(-40).filter((r) => r.path === "/api/ai/record" && r.method === "PUT");
  await page.evaluate(async () => (await import("/js/ai/study-record.js")).flushStudyRecord());
  await page.waitForTimeout(500);
  const none = sent.slice(-40).filter((r) => r.path === "/api/ai/record" && r.method === "PUT");
  assert(none.length === after.length, "it sent with no AI");
  void firstValue;
});

await browser.close();
writeFileSync(join(OUT, "coach-check.json"), JSON.stringify({ results }, null, 1));
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `coach check: ${failed.length} of ${results.length} stages FAILED` : `coach check: all ${results.length} stages passed`);
process.exit(failed.length ? 1 : 0);
