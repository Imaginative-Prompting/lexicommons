// A practice against a REAL AI, on a LOCAL server: this script plays you in headless Chrome (a scripted learner), and
// a real AI client (Codex, Claude Code…) plays itself over MCP with the token this script makes. It signs up, writes
// the token to <outDir>/token.txt, starts a practice, waits for the AI to join, answers each of the AI's turns from a
// short script (typed; a card gets its first choice or "I don't know"), presses End after the last answer, waits for
// the summary, saves the transcript and screenshots, then deletes the account.
//
//   python3 pipelines/lyric-video/tools/gpu.py run --who lex-ai-practice --label "practice live" --kind stills -- \
//     node 08-lexicommons/app/scripts/practice-live.mjs http://localhost:<port> <outDir> [--kind conversation]
//   then, once <outDir>/token.txt exists, start the AI with that token (see app/docs/practice.md).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const args = process.argv.slice(2);
const kindAt = args.indexOf("--kind");
const KIND = kindAt >= 0 ? args[kindAt + 1] : "conversation";
const [BASE, OUT = "practice-live-out"] = args.filter((_, i) => kindAt < 0 || (i !== kindAt && i !== kindAt + 1));
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("practice-live creates and deletes an account: give it a local server");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });
const ANSWERS = ["Gisteren ik heb gewerkt en daarna ik ben naar de winkel gegaan.", "Ik heb brood gekocht. Morgen ik ga naar oma.", "Ja, ik wil morgen met de trein gaan."];
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(e.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const ROOM = ".lx-practice-room:not([data-ghost])";
let shots = 0;
const shot = (name) => page.screenshot({ path: join(OUT, "shots", `${String(++shots).padStart(2, "0")}-${name}.png`) });

let exitCode = 0;
try {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Live Practice");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  const token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Live AI" }) })).json()).token);
  writeFileSync(join(OUT, "token.txt"), token);
  log("signed up; token written");

  await page.goto(`${BASE}/app/#study/practice/new/${KIND}`);
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="segment"]', { hasText: "Type" }).last().click();
  await page.getByRole("button", { name: "Start" }).click();
  await page.locator(ROOM).waitFor();
  log("practice started; waiting for the AI to join");
  await page.locator(`${ROOM} [data-part="chat-event"]`, { hasText: "joined" }).waitFor({ timeout: 10 * 60_000 });
  log("the AI joined");
  await shot("joined");

  // Answers each turn of the AI's: waits until it's your move (its status says it's listening and something new came).
  let seen = 0;
  const aiTurns = () => page.evaluate((room) => document.querySelectorAll(`${room} [data-part="chat"] > :is([data-part="chat-line"][data-variant="ai"], [data-part="chat-line"][data-variant="task"], [data-part="practice-card"], [data-part="chat-note"], [data-part="practice-scene"])`).length, ROOM);
  for (const answer of ANSWERS) {
    const until = Date.now() + 5 * 60_000;
    while ((await aiTurns()) <= seen) {
      if (Date.now() > until) throw new Error("the AI didn't reply within 5 minutes");
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500); // it may send more than one thing in a reply
    seen = await aiTurns();
    const card = page.locator(`${ROOM} [data-part="practice-card"]`).last();
    if ((await card.count()) && !(await card.locator('[data-part="feedback"]').count())) {
      const choice = card.locator('[data-part="choice"]').first();
      if (await choice.count()) await choice.click();
      else await card.getByRole("button", { name: "I don't know" }).click();
      log("answered a card");
    } else {
      await page.locator(`${ROOM} [data-part="composer"] input`).fill(answer);
      await page.locator(`${ROOM} [data-part="composer"] input`).press("Enter");
      log(`said: ${answer}`);
    }
    await shot("turn");
  }
  // The AI's reply to the last answer, then End.
  const until = Date.now() + 5 * 60_000;
  while ((await aiTurns()) <= seen) {
    if (Date.now() > until) throw new Error("no reply to the last answer");
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  await shot("before-end");
  await page.locator(ROOM).getByRole("button", { name: "End", exact: true }).click();
  log("ended; waiting for the summary");
  await page.locator(`${ROOM} [data-part="session-summary"]`).waitFor({ timeout: 4 * 60_000 });
  await shot("summary");
  const id = await page.evaluate(async () => (await import("/js/practice/store.js")).listPractices().then((all) => all[0]?.id));
  const practice = await page.evaluate(async (pid) => (await import("/js/practice/store.js")).getPractice(pid), id);
  const evidence = await page.evaluate(async (pid) => (await import("/js/study/progress.js")).allEvidence().filter((r) => r.practice === pid), id);
  writeFileSync(join(OUT, "transcript.json"), JSON.stringify({ practice, evidence, problems }, null, 2));
  log(`saved: ${practice.turns.length} turns, ${evidence.length} evidence rows, ${problems.length} console errors`);
  if (problems.length) exitCode = 1;
} catch (error) {
  log(`FAIL: ${error.message}`);
  await shot("fail").catch(() => {});
  exitCode = 1;
} finally {
  await page.evaluate(async () => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
  await browser.close();
}
process.exit(exitCode);
