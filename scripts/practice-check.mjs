// Checks Practice with your AI end to end on a LOCAL server (it creates and deletes a test account): you in headless
// Chrome, your AI played by this script over MCP with a personal token (the same tools a real AI calls). Study's row
// and the section, starting a practice with the AI waiting first, its lines (literal line, English), typed and spoken
// turns (Whisper on the device; the microphone a recording that starts on the app's listening cue), grades marking your line and becoming evidence, every kind
// of card, Hint, the status when the AI goes quiet, a dropped connection, leaving and coming back, the room's frame (a
// solid header and footer, the microphone centered on your line, an opened meaning scrolled into view), the end with a
// summary saved on the device, a past practice, a practice logged from the AI's own app, Today's line, the phone
// layout, animations off, the motion rule, and no console errors. Chrome runs muted: nothing is heard.
//
// Usage (headless Chrome, so through the channel's GPU queue, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lex-ai-practice --label "practice check" --kind stills -- \
//     node 08-lexicommons/app/scripts/practice-check.mjs http://localhost:<port> <outDir>
// Local server: as app-check (app/AGENTS.md); its public/models must hold whisper-small (scripts/speech-build.mjs).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const [BASE, OUT = "practice-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("practice-check creates and deletes an account: give it a local server, e.g. http://localhost:8811");
  process.exit(2);
}
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(OUT, "shots"), { recursive: true });

// The microphone: a learner's wrong order ("Morgen we gaan naar oma."), starting the moment the app's microphone button
// says it's listening (CUE_MIC), with silence after it so it ends. No silence before it: the cue promises that
// anything said from then on is heard, so the first word comes at once. (Chrome's fake device started its file when
// the microphone opened instead, and the check passed only while the recorder started within its 700 ms of silence:
// on 3 Nov, with Bluetooth headphones as the Mac's output, it started 0.87 s after and "Morgen" was lost.)
const WAV = resolve(OUT, "mic-morgen-oma-wrong.wav");
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(APP, "scripts/fixtures/wrong-orders/morgen-oma-wrong-1.mp3"), "-af", "apad=pad_dur=3", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", WAV]);

/**
 * The page's microphone (in the page before the app's code): getUserMedia hands the app a track of the check's own
 * (MediaStreamTrackGenerator), on its own clock as a real microphone is: 10 ms of audio every 10 ms from the moment it
 * opens, silence until the app's microphone button says "listening" (data-state), then the recording. What the app
 * doesn't take in time is gone, as from a real one, so a recorder that starts after its cue, or a cue shown before it
 * has started, loses the sentence's first word. (An AudioContext's stream would wait for the app instead: on 3 Nov the
 * unfixed app passed with one.) window.__cueMic counts the microphones opened and the recordings started on a cue.
 */
const CUE_MIC = (wav) => {
  const bytes = Uint8Array.from(atob(wav), (c) => c.charCodeAt(0)).buffer;
  const log = (window.__cueMic = { opened: 0, cued: [], missed: 0 });
  const RATE = 48000;
  const FRAME = 480; // 10 ms
  let recording = null;
  const live = []; // microphones open now: { opened, speechFrom (frame index) }
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints?.audio || constraints.video) throw new DOMException("The check's microphone is audio only.", "NotSupportedError");
    recording ??= (await new OfflineAudioContext(1, RATE, RATE).decodeAudioData(bytes.slice(0))).getChannelData(0);
    const track = new MediaStreamTrackGenerator({ kind: "audio" });
    const writer = track.writable.getWriter();
    const mic = { opened: performance.now(), speechFrom: null };
    live.push(mic);
    log.opened++;
    let next = 0;
    const pump = () => {
      if (track.readyState === "ended") {
        clearInterval(timer);
        live.splice(live.indexOf(mic), 1);
        if (mic.speechFrom === null) log.missed++;
        return;
      }
      const due = Math.floor((performance.now() - mic.opened) / 10) + 1;
      for (; next < due; next++) {
        const data = new Float32Array(FRAME);
        if (mic.speechFrom !== null) {
          const from = (next - mic.speechFrom) * FRAME;
          if (from >= 0 && from < recording.length) data.set(recording.subarray(from, Math.min(recording.length, from + FRAME)));
        }
        writer.write(new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfFrames: FRAME, numberOfChannels: 1, timestamp: next * 10_000, data })).catch(() => {});
      }
    };
    const timer = setInterval(pump, 5);
    pump();
    return new MediaStream([track]);
  };
  // The cue: from the next frame on, the microphone hears the recording.
  const cue = () => {
    for (const mic of live) {
      if (mic.speechFrom !== null) continue;
      mic.speechFrom = Math.floor((performance.now() - mic.opened) / 10) + 1;
      log.cued.push(Math.round(performance.now() - mic.opened));
    }
  };
  new MutationObserver((records) => {
    for (const r of records) if (r.target.matches?.('[data-part="mic-button"]') && r.target.getAttribute("data-state") === "listening") cue();
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
};
const cueMic = () => page.evaluate(() => ({ opened: window.__cueMic.opened, cued: [...window.__cueMic.cued], missed: window.__cueMic.missed }));

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
    await page.screenshot({ path: join(OUT, "shots", `FAIL-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--mute-audio", "--enable-unsafe-webgpu", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await context.grantPermissions(["microphone"], { origin: new URL(BASE).origin });
await context.addInitScript(CUE_MIC, readFileSync(WAV).toString("base64"));
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const ROOM = ".lx-practice-room:not([data-ghost])";
const room = () => page.locator(ROOM);
const shot = async (name) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
/** Polls a check in the page (an async check counts only when it resolves true). */
async function until(fn, arg, timeout = 15_000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 140)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
const slowMotion = (on) =>
  page.evaluate((slow) => {
    for (const name of ["--dur-150", "--dur-200", "--dur-320", "--dur-640"]) {
      if (slow) document.documentElement.style.setProperty(name, "3000ms");
      else document.documentElement.style.removeProperty(name);
    }
  }, on);
const evidence = (filter) => page.evaluate(async (f) => (await import("/js/study/progress.js")).allEvidence().filter((row) => Object.entries(f).every(([k, v]) => row[k] === v)), filter);

// ---------- your AI, over MCP ----------

let token = null;
async function mcp(name, args = {}) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) throw new Error(`${name}: ${error.message}`);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}
const ai = { id: null, seat: null, after: 0 };
/** practice_wait until it returns something other than waiting (each call up to `seconds`). */
async function aiWait(seconds = 20) {
  for (;;) {
    const r = await mcp("practice_wait", { practice_id: ai.id ?? undefined, seat: ai.seat ?? undefined, after: ai.after, wait_seconds: seconds });
    if (r.status === "waiting") continue;
    if (r.after !== undefined) ai.after = r.after;
    return r;
  }
}
const reply = (body) => mcp("practice_reply", { practice_id: ai.id, seat: ai.seat, ...body });
/** Deals a card and returns the AI's view of your answer (its next wait). */
async function deal(card, answer) {
  const cards = room().locator('[data-part="chat"] > [data-part="practice-card"]');
  const before = await cards.count();
  const waiting = aiWait();
  const sent = await reply({ card });
  // This card, not the one before it: wait for it to arrive.
  const node = cards.nth(before);
  await node.waitFor();
  await answer(node);
  const r = await waiting;
  assert(r.status === "your_move" && r.turns.at(-1).type === "card" && r.turns.at(-1).card === sent.seq, `the AI got the card's result: ${JSON.stringify(r).slice(0, 200)}`);
  return { turn: r.turns.at(-1), node, seq: sent.seq };
}

const LINE1 = { nl: "Hoi! Wat heb je gisteren gedaan?", literal: ["Hi!", "What", "have", "you", "*yesterday*", "*done*"], english: [0, 1, 2, 3, 5, 4], en: "Hi! What did you do yesterday?", words: { gedaan: "doen", gisteren: "gisteren" } };

// ---------- the run ----------

await stage("sign up with a passkey; a token for the AI", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Practice Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  token = (await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Practice check" }) })).json()).token));
  assert(token?.startsWith("lct_"), "token made");
  // Whisper (the small model) listens in this run: downloaded once, from this server.
  const model = await page.evaluate(async () => {
    const speech = await import("/js/speech/speech.js");
    await speech.downloadModel("whisper-small");
    const settings = await import("/js/study/settings.js");
    settings.setStudySetting("say.engine", "whisper");
    settings.setStudySetting("say.model", "whisper-small");
    return (await speech.modelState("whisper-small")).state;
  });
  assert(model === "ready", `whisper-small ${model}`);
  return "signed in; whisper-small ready";
});

await stage("the AI tab's row opens the Practice section", async () => {
  await page.goto(`${BASE}/app/#ai`);
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="list-row"]', { hasText: "Past practices" }).click();
  await page.waitForFunction(() => location.hash === "#practice");
  await page.locator('[data-part="page-title"]', { hasText: "Practice with your AI" }).waitFor();
  const kinds = await page.locator('[data-part="page"] [data-part="list-row"] .lx-row-title').allTextContents();
  for (const name of ["Conversation", "Role-play", "Translate", "Story", "Deal me games", "Ask why"]) assert(kinds.includes(name), `kind ${name} listed: ${kinds}`);
  await page.getByText("Practice Dutch with me here").waitFor();
  await page.getByText("Connected:", { exact: false }).or(page.getByText("No AI is connected yet")).first().waitFor();
  await shot("01-practice-home");
  return `${kinds.length} rows`;
});

await stage("the AI waits first; Start in the app and it joins at once", async () => {
  const waiting = mcp("practice_wait", { wait_seconds: 40 });
  await page.locator('[data-part="list-row"]', { hasText: "Conversation" }).first().click();
  await page.waitForFunction(() => location.hash === "#practice/new/conversation");
  await page.locator('[data-part="segment"]', { hasText: "Speak or type" }).click();
  await page.fill('input[aria-label="Topic"]', "family");
  await shot("02-setup");
  const started = Date.now();
  await page.getByRole("button", { name: "Start" }).click();
  await room().waitFor();
  const joined = await waiting;
  assert(joined.status === "joined" && joined.learner?.patterns?.length >= 8 && joined.practice.topic === "family", `joined with the learner: ${joined.status}`);
  Object.assign(ai, { id: joined.practice.id, seat: joined.seat, after: joined.after });
  await room().locator('[data-part="chat-event"]', { hasText: "Practice check joined" }).waitFor();
  await until(() => document.querySelector('.lx-practice-room [data-part="ai-wait"]')?.hidden === true);
  return `joined ${Date.now() - started} ms after Start`;
});

await stage("its line arrives; a tap shows the literal line and the English, and it flips", async () => {
  await reply({ say: LINE1, expect: "either" });
  const line = room().locator('[data-part="chat-line"][data-variant="ai"]').first();
  await line.waitFor();
  await line.locator(".lx-chat-nl").click();
  await line.locator('[data-part="literal-line"]').waitFor();
  await line.locator('[data-part="natural-line"]', { hasText: "What did you do yesterday?" }).waitFor();
  const moved = await line.locator('[data-part="literal-chunk"][data-state="moved"]').count();
  await line.locator('[data-part="order-toggle"]').click();
  await until(() => document.querySelector('.lx-practice-room [data-part="literal-line"]')?.getAttribute("data-order") === "english");
  await shot("03-ai-line-revealed");
  return `${moved} moved words`;
});

await stage("a typed turn reaches the AI at once; thinking dots while it works", async () => {
  const waiting = aiWait();
  await room().locator('[data-part="composer"] input').fill("Gisteren ik ben naar de winkel gegaan");
  const sentAt = Date.now();
  await room().locator('[data-part="composer"] input').press("Enter");
  const r = await waiting;
  const ms = Date.now() - sentAt;
  assert(r.status === "your_move" && r.turns[0].text === "Gisteren ik ben naar de winkel gegaan" && r.turns[0].how === "typed", JSON.stringify(r).slice(0, 200));
  await room().locator('[data-part="chat-line"][data-variant="you"][data-state="sent"]').waitFor();
  await room().locator('[data-part="chat-typing"]').waitFor({ timeout: 5000 });
  ai.lastSaid = r.turns[0].seq;
  return `the AI had it ${ms} ms after Enter`;
});

await stage("the grade marks your line and becomes evidence", async () => {
  await reply({
    grade: {
      verdict: "fixed",
      better: "Gisteren ben ik naar de winkel gegaan.",
      marks: [{ said: "ik ben", fix: "ben ik" }],
      concepts: [
        { concept: "p:v2", outcome: "wrong", note: "After gisteren the verb comes next." },
        { concept: "p:perfect", outcome: "right" },
        { concept: "w:winkel", outcome: "right" },
        { concept: "p:separable", outcome: "avoided" },
      ],
      note: "Start with a time word and the verb jumps ahead of ik.",
    },
    say: { nl: "Wat heb je gekocht?", literal: ["What", "have", "you", "*bought*"], en: "What did you buy?", words: { gekocht: "kopen" } },
  });
  const you = room().locator('[data-part="chat-line"][data-variant="you"]').first();
  await you.locator('[data-part="chat-mark"]', { hasText: "ik ben" }).waitFor();
  await you.locator('[data-part="chat-fix"]', { hasText: "ben ik" }).waitFor();
  await you.locator('[data-part="correction"][data-meaning="wrong"]').waitFor();
  await until(() => !document.querySelector('.lx-practice-room [data-part="chat-typing"]'));
  await until(async () => (await import("/js/study/progress.js")).allEvidence().filter((r) => r.activity === "practice:conversation").length === 3);
  const rows = await evidence({ activity: "practice:conversation" });
  const v2 = rows.find((r) => r.concept === "p:v2");
  assert(v2?.outcome === "wrong" && v2.skill === "say" && v2.test === "free" && v2.marked === true && v2.source === "ai" && v2.client === "Practice check" && v2.said?.startsWith("Gisteren"), JSON.stringify(v2));
  assert(!rows.some((r) => r.concept === "p:separable"), "avoided isn't evidence");
  await shot("04-graded");
  return rows.map((r) => `${r.concept} ${r.outcome}`).join(", ");
});

await stage("cards: choose, arrange, place, fill, type, write, match, each graded here and sent to the AI", async () => {
  const done = [];
  let r = await deal(
    { game: "choose", nl: "Morgen gaan we naar oma.", en: "Tomorrow we're going to grandma's.", literal: ["Tomorrow", "*go*", "we", "to grandma"], wrong: ["Morgen we gaan naar oma.", "We morgen gaan naar oma."], patterns: ["v2"], words: { morgen: "morgen", gaan: "gaan", oma: "oma" } },
    (card) => card.locator('[data-part="choice"]', { hasText: /^Morgen gaan we naar oma\.$/ }).click(),
  );
  assert(r.turn.correct === true, "choose right");
  done.push("choose");
  await r.node.locator('[data-part="feedback"][data-meaning="right"]').waitFor();
  r = await deal(
    { game: "arrange", nl: "Ik heb gisteren een boek gelezen.", en: "I read a book yesterday.", literal: ["I have", "*yesterday*", "a book", "*read*"], moved: ["gisteren", "gelezen"], patterns: ["perfect"], words: { gisteren: "gisteren", boek: "boek", gelezen: "lezen" } },
    async (card) => {
      for (const word of ["Ik", "heb", "gisteren", "een", "boek", "gelezen"]) await card.locator('[data-part="arrange-bank"] [data-part="tile"]', { hasText: new RegExp(`^${word}$`) }).click();
      await card.getByRole("button", { name: "Check" }).click();
    },
  );
  assert(r.turn.correct === true, `arrange right: ${r.turn.answer}`);
  done.push("arrange");
  r = await deal({ game: "place", nl: "Ik bel je morgen op.", en: "I'll call you tomorrow.", place: { word: "op" }, patterns: ["separable"], words: { bel: "opbellen" } }, (card) => card.locator('[data-part="place-gap"][aria-label="After “morgen”"]').click());
  assert(r.turn.correct === true, `place right: ${r.turn.answer}`);
  done.push("place");
  r = await deal({ game: "fill", nl: "Hij zegt dat hij morgen komt.", en: "He says he's coming tomorrow.", gap: { word: "komt", options: ["komt", "kom", "komen"] }, patterns: ["dat"], words: { komt: "komen" } }, (card) => card.getByRole("button", { name: "kom", exact: true }).click());
  assert(r.turn.correct === false && r.turn.answer === "kom", "fill wrong (on purpose)");
  await r.node.locator('[data-part="feedback"][data-meaning="wrong"]').waitFor();
  await r.node.locator('[data-part="chat-line"] [data-part="literal-line"]').waitFor().catch(() => {});
  done.push("fill (wrong)");
  r = await deal({ game: "type", nl: "Ik wil vanavond pizza eten.", en: "I want to eat pizza tonight.", gap: { word: "eten" }, patterns: ["modal"], words: { eten: "eten" } }, async (card) => {
    await card.locator('[data-part="type-answer"] input').fill("eten");
    await card.locator('[data-part="type-answer"] input').press("Enter");
  });
  assert(r.turn.correct === true, "type right");
  done.push("type");
  r = await deal({ game: "write", nl: "Wat eet je vanavond?", en: "What are you eating tonight?", patterns: ["question"], words: { eet: "eten" } }, async (card) => {
    await card.locator('[data-part="type-answer"] input').fill("wat eet je vanavond");
    await card.locator('[data-part="type-answer"] input').press("Enter");
  });
  assert(r.turn.correct === true, "write right (case and punctuation forgiven)");
  done.push("write");
  r = await deal({ game: "match", pairs: [["de trein", "the train"], ["het brood", "the bread"], ["de winkel", "the shop"]], words: { "de trein": "trein", "het brood": "brood", "de winkel": "winkel" } }, async (card) => {
    for (const [nl, en] of [["de trein", "the train"], ["het brood", "the bread"], ["de winkel", "the shop"]]) {
      await card.locator('[data-part="match-item"][data-side="nl"]', { hasText: nl }).click();
      await card.locator('[data-part="match-item"][data-side="en"]', { hasText: en }).click();
    }
  });
  assert(r.turn.correct === true, "match right");
  done.push("match");
  // Study's games record these; a practice card records the same, tagged.
  const rows = await evidence({ source: "ai", activity: "arrange" });
  assert(rows.some((row) => row.concept === "p:perfect" && row.outcome === "right" && row.practice === ai.id) && rows.some((row) => row.concept === "w:lezen"), JSON.stringify(rows).slice(0, 200));
  const fill = await evidence({ activity: "fill", concept: "w:komen" });
  assert(fill[0]?.outcome === "wrong" && fill[0]?.source === "ai", "the gap word missed");
  await shot("05-cards");
  return done.join(", ");
});

await stage("motion rule: a card pressed 3 ms into a 3-second appear still answers", async () => {
  await slowMotion(true);
  const waiting = aiWait();
  await reply({ card: { game: "choose", nl: "Ik heb hem niet gezien.", en: "I didn't see him.", wrong: ["Ik heb niet hem gezien."], patterns: ["niet"] } });
  const card = room().locator('[data-part="practice-card"]', { hasText: "I didn't see him." });
  await card.waitFor({ state: "attached" });
  // At once, while it's still appearing: force skips Playwright's wait for the animation to settle.
  await card.locator('[data-part="choice"]', { hasText: /^Ik heb hem niet gezien\.$/ }).click({ force: true, timeout: 3000 });
  const r = await waiting;
  await slowMotion(false);
  assert(r.turns.at(-1).correct === true, "the press landed");
  return "landed";
});

await stage("Hint reaches the AI", async () => {
  const waiting = aiWait();
  await room().getByRole("button", { name: "Hint", exact: true }).click();
  const r = await waiting;
  assert(r.turns.at(-1).type === "hint", JSON.stringify(r.turns));
  await room().locator('[data-part="chat-event"]', { hasText: "You asked for a hint" }).waitFor();
  await reply({ explain: "Start with Morgen, then the verb: Morgen ga ik…", translate: "Tomorrow I'm going to grandma's." });
  await room().locator('[data-part="chat-line"][data-variant="task"]').waitFor();
  return "hint → explain + translate";
});

await stage("a spoken turn: Whisper on the device hears what's said from the listening cue, the first word too; the AI gets it marked spoken", async () => {
  const waiting = aiWait();
  const mic = await cueMic();
  await room().locator('[data-part="composer"] [data-part="mic-button"]').click();
  const r = await waiting;
  const turn = r.turns.at(-1);
  const now = await cueMic();
  assert(now.opened === mic.opened + 1 && now.cued.length === mic.cued.length + 1, `one microphone opened and its speech started on the cue: ${JSON.stringify(now)}`);
  // The first press is the slow one: the recorder's first start. "Morgen" is the sentence's first word, said at the cue.
  assert(turn.type === "said" && turn.how === "spoken" && turn.engine === "whisper" && /^\W*morgen\b/i.test(turn.text) && /oma/i.test(turn.text), JSON.stringify(turn));
  await room().locator('[data-part="chat-line"][data-variant="you"] .lx-chat-how').last().waitFor();
  await reply({ grade: { verdict: "fixed", better: "Morgen gaan we naar oma.", marks: [{ said: turn.text.split(/\s+/).slice(1, 3).join(" "), fix: "gaan we" }], concepts: [{ concept: "p:v2", outcome: "hint" }] } });
  await room().locator('[data-part="correction"][data-meaning="wrong"]').last().waitFor();
  const spoken = await evidence({ activity: "practice:conversation", skill: "say" });
  assert(spoken.some((row) => row.outcome === "right" && row.help === "nudge" && row.how === "spoken"), "spoken grade recorded as saying, its hint a nudge");
  await shot("06-spoken");
  return `heard “${turn.text}”${turn.unsure.length ? `, unsure: ${turn.unsure.join(", ")}` : ""}; the cue ${now.cued.at(-1)} ms after the microphone opened`;
});

await stage("a Say it card: the same recognizer checks the sentence", async () => {
  const r = await deal({ game: "say", nl: "Morgen gaan we naar oma.", en: "Tomorrow we're going to grandma's.", from: "dutch", patterns: ["v2"], words: { morgen: "morgen", oma: "oma" } }, async (card) => {
    await card.locator('[data-part="mic-button"]').click();
    await card.locator('[data-part="said-line"]').waitFor({ timeout: 60_000 });
    await card.getByRole("button", { name: "I don't know" }).click();
  });
  const said = await r.node.locator('[data-part="said-word"]').evaluateAll((words) => words.map((w) => `${w.textContent}:${w.getAttribute("data-state")}`));
  assert(r.turn.correct === false && said.some((w) => w.endsWith(":order")), `the wrong order heard as such: ${said}`);
  assert(said[0] === "Morgen:right", `its first word, said at the cue, heard: ${said}`);
  const mic = await cueMic();
  assert(mic.cued.length === mic.opened && !mic.missed, `every microphone's speech started on its cue: ${JSON.stringify(mic)}`);
  return said.join(" ");
});

await stage("the AI goes quiet: thinking, then “taking a while”", async () => {
  const waiting = aiWait();
  await room().locator('[data-part="composer"] input').fill("Morgen ga ik naar oma.");
  await room().locator('[data-part="composer"] input').press("Enter");
  await waiting;
  await room().locator('[data-part="ai-status"][data-state="thinking"]').waitFor();
  await room().locator('[data-part="ai-status"][data-state="slow"]').waitFor({ timeout: 75_000 });
  await shot("07-slow");
  await reply({ grade: { verdict: "right", concepts: [{ concept: "p:v2", outcome: "right" }] }, say: { nl: "Goed zo!", literal: ["Good so!"], en: "Well done!" } });
  await room().locator('[data-part="ai-status"]:not([data-state="slow"]):not([data-state="thinking"])').waitFor();
  return "slow shown after 60 s, cleared by the reply";
});

await stage("a dropped connection: reconnecting, then the reply that came meanwhile", async () => {
  const quietFrom = problems.length;
  await page.route("**/api/practice/**", (route) => route.abort());
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await room().locator('[data-part="ai-status"][data-state="offline"]').waitFor({ timeout: 20_000 });
  await reply({ say: { nl: "Ben je er nog?", literal: ["Are", "you", "there", "still?"], en: "Are you still there?" } });
  await page.unroute("**/api/practice/**");
  await room().locator('[data-part="chat-line"][data-variant="ai"]', { hasText: "Ben je er nog?" }).waitFor({ timeout: 30_000 });
  // The failed requests were this stage's doing: Chrome logs each one.
  const dropped = problems.splice(quietFrom).filter((p) => !/ERR_FAILED|Failed to fetch/.test(p));
  problems.push(...dropped);
  return "recovered";
});

await stage("leave and come back: the practice carried on, drawn once", async () => {
  const LINES = '[data-part="chat"] > [data-part="chat-line"]';
  const before = await room().locator(LINES).count();
  await room().getByRole("button", { name: "Leave (the practice carries on)" }).click();
  await page.waitForFunction(() => location.hash === "#practice");
  await page.locator('[data-part="list-row"]', { hasText: "Conversation is open" }).click();
  await room().waitFor();
  await until((n) => document.querySelectorAll('.lx-practice-room [data-part="chat"] > [data-part="chat-line"]').length === n, before);
  await page.waitForTimeout(1500);
  const after = await room().locator(LINES).count();
  assert(after === before, `${before} lines before, ${after} after`);
  assert((await room().locator('[data-part="chat-mark"]').count()) >= 2, "marks redrawn");
  return `${after} lines`;
});

await stage("phone width: no sideways scroll; the composer in view", async () => {
  const sideways = await page.evaluate(() => document.querySelector(".lx-practice-room").scrollWidth - innerWidth);
  const box = await room().locator('[data-part="composer"]').boundingBox();
  assert(sideways <= 0 && box && box.y + box.height <= 844, `sideways ${sideways}, composer ${JSON.stringify(box)}`);
  await shot("08-room-phone");
  return "ok";
});

await stage("the room's frame: a solid header and footer; the microphone centered on your line; a meaning opened on the last line shows whole", async () => {
  // A tiled background (as a look would have) behind the room, for the picture: it shows only between the bands.
  const tile = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="12" fill="none" stroke="#1f3f95" stroke-width="3"/></svg>')}")`;
  await page.evaluate((image) => {
    const root = document.documentElement.style;
    root.setProperty("--image-background", image);
    root.setProperty("--image-background-size", "40px");
    root.setProperty("--image-background-repeat", "repeat");
    root.setProperty("--image-background-dim", "60%");
  }, tile);
  const bands = await page.evaluate(() => {
    const room = document.querySelector(".lx-practice-room:not([data-ghost])");
    const opaque = (node) => {
      const parts = getComputedStyle(node).backgroundColor.match(/[\d.]+/g).map(Number);
      return parts.length === 3 || parts[3] === 1;
    };
    const head = room.querySelector('[data-part="session-bar"]');
    const foot = room.querySelector('[data-part="answer-bar"]');
    const h = head.getBoundingClientRect();
    const f = foot.getBoundingClientRect();
    return { head: opaque(head), foot: opaque(foot), h: [h.left, h.top, h.right], f: [f.left, f.bottom, f.right], w: innerWidth, hgt: innerHeight };
  });
  assert(bands.head && bands.foot, `both bands solid: ${JSON.stringify(bands)}`);
  assert(bands.h[0] === 0 && bands.h[1] === 0 && bands.h[2] === bands.w, `the header spans the top edge: ${bands.h}`);
  assert(bands.f[0] === 0 && Math.abs(bands.f[1] - bands.hgt) < 1 && bands.f[2] === bands.w, `the footer spans the bottom edge: ${bands.f}`);

  // The microphone on a spoken line sits on its first line of text; your AI's buttons sit on its first line too.
  const centres = await page.evaluate(() => {
    const room = document.querySelector(".lx-practice-room:not([data-ghost])");
    const mid = (r) => r.top + r.height / 2;
    const firstLine = (text) => text.getBoundingClientRect().top + parseFloat(getComputedStyle(text).paddingTop) + parseFloat(getComputedStyle(text).lineHeight) / 2;
    const mine = [...room.querySelectorAll('[data-part="chat-line"][data-variant="you"]')].find((line) => line.querySelector(".lx-chat-how"));
    const ai = room.querySelector('[data-part="chat-line"][data-variant="ai"]');
    return {
      mic: mid(mine.querySelector(".lx-chat-how svg").getBoundingClientRect()) - firstLine(mine.querySelector('[data-part="chat-said"]')),
      saidPad: parseFloat(getComputedStyle(mine.querySelector('[data-part="chat-said"]')).paddingTop),
      speak: mid(ai.querySelector('[data-part="speak-button"]').getBoundingClientRect()) - firstLine(ai.querySelector(".lx-chat-nl")),
      reveal: mid(ai.querySelector(".lx-chat-reveal").getBoundingClientRect()) - firstLine(ai.querySelector(".lx-chat-nl")),
    };
  });
  assert(Math.abs(centres.mic) <= 1 && centres.saidPad === 0, `microphone on the first line (off by ${centres.mic.toFixed(1)} px), no extra space above your words (${centres.saidPad} px)`);
  assert(Math.abs(centres.speak) <= 1 && Math.abs(centres.reveal) <= 1, `speak and meaning buttons on the first line (off by ${centres.speak.toFixed(1)} and ${centres.reveal.toFixed(1)} px)`);

  // The newest line, with a long meaning: opening it scrolls it into view, clear of the footer.
  await reply({ say: { nl: "Ik heb gisteren met mijn oma een lange wandeling door het park gemaakt.", literal: ["I have", "*yesterday*", "with my grandma", "a long walk", "through the park", "*made*"], en: "Yesterday I went for a long walk through the park with my grandma." }, expect: "either" });
  const last = room().locator('[data-part="chat-line"][data-variant="ai"]').last();
  await last.locator(".lx-chat-nl", { hasText: "wandeling" }).waitFor();
  await page.waitForTimeout(1200); // the arrival's scroll to the bottom
  await last.locator(".lx-chat-reveal").click();
  await last.locator('[data-part="natural-line"]').waitFor();
  await page.waitForTimeout(1200); // the reveal's scroll
  const fit = await page.evaluate(() => {
    const room = document.querySelector(".lx-practice-room:not([data-ghost])");
    const line = [...room.querySelectorAll('[data-part="chat-line"][data-variant="ai"]')].at(-1).getBoundingClientRect();
    const view = room.querySelector('[data-part="activity"]').getBoundingClientRect();
    return { lineBottom: line.bottom, viewBottom: view.bottom, lineTop: line.top, viewTop: view.top };
  });
  assert(fit.lineBottom <= fit.viewBottom && fit.lineTop >= fit.viewTop, `the opened line fits the conversation's view: ${JSON.stringify(fit)}`);
  await shot("08b-room-frame");
  await page.evaluate(() => ["--image-background", "--image-background-size", "--image-background-repeat", "--image-background-dim"].forEach((name) => document.documentElement.style.removeProperty(name)));
  return `mic off ${centres.mic.toFixed(1)} px; line ends ${(fit.viewBottom - fit.lineBottom).toFixed(0)} px above the footer`;
});

await stage("End: the AI's summary arrives, the practice is saved on this device, the server lets it go", async () => {
  const waiting = aiWait();
  await room().getByRole("button", { name: "End", exact: true }).click();
  const r = await waiting;
  assert(r.status === "ended" && /practice_end/.test(r.next), JSON.stringify(r).slice(0, 200));
  await room().getByText("Waiting for Practice check's summary…").waitFor();
  await mcp("practice_end", {
    practice_id: ai.id,
    seat: ai.seat,
    summary: { text: "Good practice. Your perfect tense is solid.", went_well: ["Perfect with zijn"], work_on: ["Verb second after a time word"], new_words: [{ nl: "de winkel", en: "the shop" }], concepts: [{ concept: "w:kopen", outcome: "right" }] },
  });
  await room().locator('[data-part="session-summary"]').waitFor({ timeout: 30_000 });
  await room().getByText("Good practice. Your perfect tense is solid.").waitFor();
  await until(async (id) => (await (await import("/js/practice/store.js")).getPractice(id))?.turns.some((t) => t.type === "summary"), ai.id);
  const server = await page.evaluate(async () => (await (await fetch("/api/practice")).json()).map((p) => ({ id: p.id, collected: Boolean(p.collectedAt) })));
  assert(server.find((p) => p.id === ai.id)?.collected, `collected: ${JSON.stringify(server)}`);
  const summaryRows = await evidence({ item: `practice:${ai.id}:summary` });
  assert(summaryRows.length === 1 && summaryRows[0].concept === "w:kopen", "the summary's concept counted");
  await shot("09-summary");
  return "saved, collected";
});

await stage("the past practice: summary and the whole transcript, cards answered", async () => {
  await room().getByRole("button", { name: "Done" }).click();
  await page.waitForFunction(() => location.hash === "#practice");
  await page.locator('[data-part="list-row"]', { hasText: "Conversation" }).filter({ hasText: "answers" }).first().click();
  await page.locator('[data-part="session-summary"]').waitFor();
  const cards = await page.locator('[data-part="page"] [data-part="practice-card"]').count();
  const answered = await page.locator('[data-part="page"] [data-part="practice-card"] [data-part="feedback"]').count();
  assert(cards >= 9 && answered === cards, `${answered} of ${cards} cards show their result`);
  await shot("10-past");
  return `${cards} cards`;
});

await stage("a practice in the AI's own app: logged, followed live, saved", async () => {
  const first = await mcp("practice_log", {
    kind: "conversation",
    turns: [
      { who: "ai", nl: "Hoe gaat het met je?", literal: ["How", "goes", "it", "with you?"], en: "How are you?" },
      { who: "you", text: "Het gaat goed met mij", how: "spoken", grade: { verdict: "right", concepts: [{ concept: "w:gaan", outcome: "right" }] } },
    ],
  });
  await page.goto(`${BASE}/app/#practice`);
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="list-row"]', { hasText: "is logging a practice" }).click();
  await room().waitFor();
  await room().locator('[data-part="ai-status"][data-state="logging"]').waitFor();
  assert((await room().locator('[data-part="composer"]').count()) === 0, "no composer: you answer in your AI");
  await room().getByText("Het gaat goed met mij").waitFor();
  await mcp("practice_log", { practice_id: first.practiceId, turns: [{ who: "ai", nl: "Fijn!", en: "Great!" }], done: true, summary: { text: "A short chat." } });
  await room().getByText("Fijn!").waitFor();
  await room().locator('[data-part="session-summary"]').waitFor({ timeout: 30_000 });
  const rows = await evidence({ practice: first.practiceId });
  assert(rows.length === 1 && rows[0].skill === "say", JSON.stringify(rows));
  await shot("11-logged");
  return "followed and saved";
});

await stage("Today offers no practice", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]");
  // Today offers no AI, connected or not: a practice's own page keeps them (the past practice, above).
  assert(!(await page.getByText("Practice with your AI").count()), "Practice with your AI on Today");
  return "no practice line";
});

await stage("animations off: the room still works, nothing animates", async () => {
  await page.evaluate(async () => (await import("/js/lx/theme.js")).setPreset("motion", "off"));
  const waiting = mcp("practice_wait", { wait_seconds: 30 });
  await page.goto(`${BASE}/app/#practice/new/games`);
  await page.waitForSelector("html[data-app-ready]");
  await page.getByRole("button", { name: "Start" }).click();
  await room().waitFor();
  const joined = await waiting;
  Object.assign(ai, { id: joined.practice.id, seat: joined.seat, after: joined.after });
  await reply({ explain: "Let's play.", card: { game: "choose", nl: "Ik ga morgen naar oma.", en: "I'm going to grandma's tomorrow.", wrong: ["Ik morgen ga naar oma."], patterns: ["v2"] } });
  await room().locator('[data-part="practice-card"]').waitFor();
  const running = await page.evaluate(async () => (await import("/js/lx/motion.js")).runningCount());
  assert(running === 0, `${running} animations running`);
  await room().getByRole("button", { name: "End", exact: true }).click();
  await page.evaluate(async () => (await import("/js/lx/theme.js")).setPreset("motion", "system"));
  return "0 running";
});

await stage("no console errors", async () => {
  assert(!problems.length, problems.slice(0, 5).join(" | "));
  return "none";
});

await stage("delete the test account: the practice room goes with it", async () => {
  const status = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
  assert(status === 200, `delete ${status}`);
  const mcpStatus = (await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" })).status;
  assert(mcpStatus === 401, `token gone: ${mcpStatus}`);
  return "deleted";
});

await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results, problems }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
