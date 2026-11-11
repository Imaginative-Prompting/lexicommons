// Checks the app end to end in headless Chrome on a LOCAL server (it creates and deletes a test account, so never
// point it at the live site): sign-up with a virtual passkey, the shell and every tab, the wide and phone layouts, a
// quick session and every game played through, the motion rule (nothing ever blocks a press: a moving thing's real
// element is already pressable at its destination, any press finishes every animation, animations off means none),
// listening (recorded voices with word timings, device voices, what plays by itself), and Settings: name, passkeys,
// tokens, appearance, export, delete the account. Fails on any console error. Chrome runs muted: nothing is heard.
//
// Local server: npx wrangler dev --port <port> --var GATE_ENABLED:false --var PUBLIC_ORIGIN:http://localhost:<port> \
//   --var RP_ID:localhost   (after: npx wrangler d1 migrations apply lexicommons --local)
// Usage (headless Chrome, so through the channel's GPU queue, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "app check" --kind stills -- \
//     node 08-lexicommons/app/scripts/app-check.mjs http://localhost:<port> <outDir>

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { fillChoice, ownText } from "./fixtures/step-text.mjs";
import { answerStep, pastReminderAsk, playToSummary, shownAfter } from "./fixtures/play-session.mjs";
import { goRouted } from "./fixtures/routed.mjs";

const [BASE, OUT = "app-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("app-check creates and deletes an account: give it a local server, e.g. http://localhost:8811");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

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
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Muted: sound plays (clips advance, voices speak) but nothing is ever heard.
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
// A failed load's line names no address of its own: its location's url does.
const consoleLine = (m) => `${m.text()}${/Failed to load resource/.test(m.text()) && m.location()?.url ? ` (${m.location().url.replace(/^https?:\/\/[^/]+/, "")})` : ""}`;
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${consoleLine(m)}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

// The real session, never a ghost copy of one still fading out in the motion layer.
const SESSION = '[data-part="session"]:not([data-ghost])';
// The clips an item (or a word) plays, in whichever recordings its pack uses here: a library pack's own (clips named by
// their bytes; the starter's library copy too) or the starter's inside the app. A clip among them is that item's,
// whichever voice it's in.
const clipsOf = (target, { item, word }) =>
  target.evaluate(
    async ({ item, word }) => {
      const [packs, voice] = await Promise.all([import("/js/study/packs.js"), import("/js/study/voice.js")]);
      const recordings = packs.libraryPacks().map((p) => packs.packAudio(p.id));
      // The starter's inside the app only while its library copy hasn't brought its own.
      if (!packs.packAudio("starter-word-order")) recordings.push(await voice.loadAudio());
      return recordings.flatMap((audio) => Object.values(audio?.voices ?? {}).map((v) => (word ? v.words?.[word]?.url : v.items?.[item.split("/").pop()]?.url))).filter(Boolean);
    },
    { item, word },
  );
const playsOneOf = (src, urls) => Boolean(src) && urls.some((url) => src === url || src.endsWith(url));
// What the page says from now on (voice.js): every recording it plays and every sentence the device's voice speaks, each with its rate.
// An item with no recording is said by the device's voice, and playbackState() tells only of the last recording element, which can be an
// earlier step's: what was said is read here instead.
const recordSaid = (target) =>
  target.evaluate(() => {
    globalThis.__lxSaid = [];
    if (globalThis.__lxSaidOn) return;
    globalThis.__lxSaidOn = true;
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u) => { globalThis.__lxSaid.push({ text: u.text, rate: u.rate }); if (!globalThis.__lxHold) return speak(u); globalThis.__lxHeld = u; setTimeout(() => u.onstart?.(new Event("start")), 0); }; const cancel = speechSynthesis.cancel.bind(speechSynthesis); speechSynthesis.cancel = () => { globalThis.__lxSaid.push({ cancel: true }); const held = globalThis.__lxHeld; globalThis.__lxHeld = null; if (held) setTimeout(() => held.onerror?.({ error: "canceled" }), 0); cancel(); };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      globalThis.__lxSaid.push({ src: this.src, rate: this.playbackRate });
      return play.call(this);
    };
  });
const saidSince = (target) => target.evaluate(() => globalThis.__lxSaid ?? []);
const plainText = (text) => String(text ?? "").toLowerCase().replace(/[.,!?¿¡"“”'’]/g, "").replace(/\s+/g, " ").trim();
/** Whether `said` (saidSince) holds an item's sentence: its own recording, or the device's voice saying its words; with rate, at that rate. */
const saysItem = (said, item, clips, rate = null) =>
  said.some((e) => (rate === null || Math.abs(e.rate - rate) < 0.01) && ((e.src && playsOneOf(e.src, clips)) || (e.text && plainText(e.text) === plainText(item.sentence))));
// Screenshots show the settled page: wait for every animation to end first (all but endless ones, like the ring
// around a speak button while it plays).
// Text nodes that are just "null" or "undefined" (an empty slot appended raw) are collected at every screenshot.
const strayText = [];
const shot = async (name, options = {}) => {
  const found = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/^\s*(null|undefined)\s*$/.test(node.textContent)) hits.push(node.parentElement?.getAttribute("data-part") ?? node.parentElement?.tagName);
    return hits;
  });
  for (const where of found) strayText.push(`${name}: in ${where}`);
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 })
    .catch(() => {});
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`), ...options });
};
const motionState = () =>
  page.evaluate(async () => {
    const m = await import("/js/lx/motion.js");
    return { running: m.runningCount(), ghosts: document.querySelectorAll("[data-motion-layer] > *").length, on: m.motionOn() };
  });
// Slow every animation right down, so "still moving" is certain when we press.
const slowMotion = (on) => page.evaluate((slow) => {
  for (const name of ["--dur-150", "--dur-200", "--dur-320", "--dur-640"]) {
    if (slow) document.documentElement.style.setProperty(name, "3000ms");
    else document.documentElement.style.removeProperty(name);
  }
}, on);

// ---------- answering steps from the content ----------

const content = () => page.evaluate(async () => {
  const c = await import("/js/study/content.js");
  return { items: c.ITEMS.map((i) => ({ ...i, sentence: c.sentence(i) })), words: c.WORDS };
});
let CONTENT = null;
// What the app has: read again when a step names something not in it yet (the library's packs arrive after sign-in, at their own pace).
const fresh = async (find) => find() ?? ((CONTENT = await content()), find());
const itemFor = (natural) => CONTENT.items.find((item) => item.means === natural);

const promptText = async () => (await page.locator(`${SESSION} [data-part="activity-prompt"] > p`).first().evaluate(ownText));
// The sentence the step is about (the session names it, so steps that hide the text can be answered too).
const currentItem = async () => {
  const id = await page.locator(SESSION).getAttribute("data-item");
  return fresh(() => CONTENT.items.find((item) => item.id === id));
};
// What a step's Arrange wants: the English chunks (in Dutch order) or the Dutch words.
const arrangeAnswer = async (item) => ((await page.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]`).first().getAttribute("lang")) === "en" ? item.literal.map(([t]) => t) : item.words.map(([t]) => t));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Where does it go asks about the moved word furthest along the sentence.
const placeIndex = (item) => Math.max(...item.moved.map((w) => item.words.findIndex(([t]) => t === w)).filter((i) => i >= 0), -1);

// Steps are played by scripts/fixtures/play-session.mjs: each by its kind as the session records it (lxStep), never its words.

// To an address in the app as a fresh page. Never a page.goto to the address the page is already at (the same game twice in a row): that
// adds a history entry with no state and no hashchange, which the router never hears of, and every back after it lands an entry off
// (fixtures/routed.mjs; Back from Settings' AI page landed on a page under Study, v96). From there it goes by a page under Study first, never a tab's
// own page (the router would step the history back for that).
async function goFresh(hash) {
  if (await page.evaluate((h) => location.pathname === "/app/" && location.hash === h, hash)) await page.goto(`${BASE}/app/${hash === "#study/path" ? "#study/packs" : "#study/path"}`);
  await page.goto(`${BASE}/app/${hash}`);
}

async function playThrough(hash) {
  await goFresh(hash);
  await page.waitForSelector('[data-part="session"]');
  return (await playToSummary(page, { session: SESSION })).map((step) => step.kind);
}

// ---------- the run ----------

await stage("sign up with a passkey, land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "App Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  CONTENT = await content();
  return `signed in; ${CONTENT.items.length} starter items`;
});

await stage("the shell: four tabs, Home, Study, Knowledge, Explore, and Read a row on Home; settings button", async () => {
  const tabs = await page.locator('[data-part="tab-bar"] [data-part="tab"]:visible').allTextContents();
  assert(tabs.join() === "Home,Study,Knowledge,Explore", `tabs: ${tabs}`);
  // Explore's home: its way to share is always there (its topics only once a pack here has one, v96).
  // Explore's phrase is its language row, there for everyone (Share what you've made is only where sharing is open to you: shell/sharing.js).
  for (const [tab, phrase, todo] of [["Home", "Your progress", false], ["Read", "Add a book or text", false], ["Explore", "Change target language", false]]) {
    // Read has no tab for now: it's Home's book card (the card itself with no book; with one, the end of its Reading heading).
    if (tab === "Read") {
      await page.locator('[data-part="tab"]', { hasText: "Home" }).first().click();
      await page.locator('[data-part="page"]:not([data-ghost]) .lx-home-cards a[href="#read"]').first().click();
    } else await page.locator('[data-part="tab"]', { hasText: tab }).first().click();
    // The page on the screen (not a kept one or a ghost) says what this tab's page says; when it doesn't, which tab and what was there.
    const shownSays = (p) => [...document.querySelectorAll('[data-part="page"]:not([data-ghost])')].some((n) => n.getClientRects().length && n.textContent.includes(p));
    await page.waitForFunction(shownSays, phrase).catch(async () => {
      const there = await page.evaluate(() => `${location.hash}; ${[...document.querySelectorAll('[data-part="page"]')].map((n) => `${n.hasAttribute("data-ghost") ? "ghost " : ""}${n.getClientRects().length ? "shown" : "hidden"}: ${n.textContent.replace(/\s+/g, " ").trim().slice(0, 60)}`).join(" | ")}`);
      throw new Error(`${tab}: no page on the screen says "${phrase}" (${there})`);
    });
    // The one title form: a tab's own page names itself in the header; a page you went into (Read, from Home) on the page.
    const titled = tab === "Read" ? page.locator('[data-part="page"]:not([data-ghost]) [data-part="page-title"]') : page.locator('[data-part="app-title"]');
    assert((await titled.first().textContent()).includes(tab), `${tab} title`);
    // Read went into from Home: its header's way back is Home.
    if (tab === "Read") assert((await page.locator('[data-part="app-back"]').textContent()).includes("Home"), "Read's way back is Home");
    assert(Boolean(await page.locator(".lx-todo [data-part=badge]", { hasText: "To do" }).count()) === todo, `${tab} TODO badge ${todo ? "missing" : "still there"}`);
  }
  await shot("01-today-phone");
  assert((await page.locator('[data-part="settings-button"]').textContent()) === "AC", "initials in the settings button");
  return "Home and the AI tab are built (scripts/knowledge-check.mjs checks Home and Knowledge, scripts/ai-check.mjs the AI tab); Explore is the community section (scripts/explore-check.mjs checks it); Read is your texts (scripts/reader-check.mjs checks it)";
});

await stage("Study's games: every game a button on Study, Study cards among them; no More ways, and its old address is Study", async () => {
  // The games themselves, so with words known: before a first word, a whole-sentence game's press starts lesson 1 (study/quick-play.js, 8 Nov 2026).
  await knowWords(page);
  await page.locator('[data-part="tab"]', { hasText: "Study" }).first().click();
  await page.waitForSelector('[data-part="study-door"]');
  // Every game is a button on Study's own page, in quick play's order (study/quick-play.js) within its section (Tapping, Typing, Speaking:
  // study/game-modes.js), Study cards last of Tapping; a press opens a session of it, and leaving comes back.
  const tiles = await page.locator('[data-part="page"] [data-part="way-tile"]').allTextContents();
  const games = await page.evaluate(async () => {
    const { GAMES } = await import("/js/study/plan.js");
    const { QUICK_GAMES, byMode } = await import("/js/study/game-modes.js");
    return byMode([...QUICK_GAMES, "card"]).flatMap((mode) => mode.kinds).map((kind) => (kind === "card" ? "Study cards" : GAMES[kind].name));
  });
  assert(JSON.stringify(tiles.map((t) => t.trim())) === JSON.stringify(games), `the games as buttons: ${tiles} vs ${games}`);
  await page.locator('[data-part="way-tile"]', { hasText: "Choose" }).first().click();
  await page.waitForFunction(() => location.hash.startsWith("#study/session/game/choose"));
  await page.waitForSelector('[data-part="session"]:not([data-ghost])');
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash === "#study");
  await page.locator('[data-part="way-tile"][data-game="card"]').click();
  await page.waitForFunction(() => location.hash.startsWith("#study/session/cards"));
  await page.waitForSelector('[data-part="session"]:not([data-ghost])');
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash === "#study");
  assert(!(await page.locator('[data-part="list-row"]', { hasText: "More ways to study" }).count()), "More ways is still on Study");
  await shot("02-study-phone", { fullPage: true });
  // An old link to More ways or its pickers is Study itself.
  for (const old of ["#study/more", "#study/concepts", "#study/topics"]) {
    await goFresh(old);
    await page.waitForSelector('[data-part="page"] [data-part="study-door"]');
    assert((await page.locator('[data-part="page"] [data-part="way-tile"]').count()) === games.length, `${old} isn't Study`);
  }
  await goFresh("#study");
  await page.waitForSelector('[data-part="page"] [data-part="way-tile"]');
  return `${tiles.length} game buttons on Study, Study cards among them; the old addresses open Study`;
});

await stage("wide screen: tabs become a sidebar with Settings at its foot", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const bar = await page.locator('[data-part="tab-bar"]').boundingBox();
  assert(bar.x === 0 && bar.width < 300 && bar.height > 800, `sidebar box ${JSON.stringify(bar)}`);
  assert(await page.locator('[data-part="tab"][data-variant="settings"]').isVisible(), "settings tab in the sidebar");
  assert(!(await page.locator('[data-part="settings-button"]').isVisible()), "header settings button hidden on wide screens");
  await shot("03-study-wide");
  // A session covers the whole window, edge to edge, not just the page column (the Study page used to show beside it).
  await page.locator('a[href="#study/session/game/arrange"]').click();
  await page.waitForSelector(SESSION);
  await page.waitForTimeout(400);
  const session = await page.locator(SESSION).boundingBox();
  await shot("03-session-wide");
  await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]:not([data-ghost])'));
  assert(session.x === 0 && session.width === 1440, `session box on a wide screen ${JSON.stringify(session)}`);
  await page.setViewportSize({ width: 390, height: 844 });
  return { bar, session };
});

await stage("a session's frame: a solid header and footer from edge to edge, the background only between", async () => {
  // The games below are the games themselves: they run on whole sentences once the words are known (plan.js).
  await knowWords(page);
  await goFresh(`#study/session/game/arrange`);
  await page.waitForSelector(SESSION);
  await page.waitForTimeout(400);
  const frame = await page.evaluate((selector) => {
    const session = document.querySelector(selector);
    const opaque = (node) => {
      const parts = getComputedStyle(node).backgroundColor.match(/[\d.]+/g).map(Number);
      return parts.length === 3 || parts[3] === 1;
    };
    const head = session.querySelector('[data-part="session-bar"]');
    const foot = session.querySelector('[data-part="answer-bar"]');
    const h = head.getBoundingClientRect();
    const f = foot.getBoundingClientRect();
    return { head: opaque(head), foot: opaque(foot), h: [h.left, h.top, h.right], f: [f.left, f.bottom, f.right], w: innerWidth, hgt: innerHeight, band: getComputedStyle(head).boxShadow };
  }, SESSION);
  assert(frame.head && frame.foot, `both bands solid, before any answer too: ${JSON.stringify(frame)}`);
  assert(frame.h[0] === 0 && frame.h[1] === 0 && frame.h[2] === frame.w, `the header spans the top edge: ${frame.h}`);
  assert(frame.f[0] === 0 && Math.abs(frame.f[1] - frame.hgt) < 1 && frame.f[2] === frame.w, `the footer spans the bottom edge: ${frame.f}`);
  // On a wide screen the bar keeps the page's width; its band (a spread shadow) reaches the window's edges.
  assert(/100vmax|\d{3,}px/.test(frame.band), `the header's band reaches past the bar: ${frame.band}`);
  await shot("03-session-frame");
  await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]:not([data-ghost])'));
  return "header and footer solid";
});

await stage("never blocks: a placed tile is pressable at its destination while its ghost is still flying", async () => {
  await goFresh(`#study/session/game/arrange`);
  await page.waitForSelector('[data-part="arrange-bank"]');
  await slowMotion(true);
  const first = page.locator('[data-part="arrange-bank"] [data-part="tile"]').first();
  const word = (await first.textContent()).trim();
  await first.click();
  const during = await page.evaluate(() => {
    const placed = document.querySelector('[data-part="arrange-answer"] [data-part="tile"]:last-child');
    const r = placed.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { hitIsReal: hit === placed || placed.contains(hit), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const moving = await motionState();
  assert(moving.running > 0 && moving.ghosts > 0, `a ghost should be in flight: ${JSON.stringify(moving)}`);
  assert(during.hitIsReal, "the press point at the destination should hit the real tile");
  // Press where it's going, at once: the real tile takes it (it goes back to the bank) and every animation finishes.
  await page.mouse.click(during.x, during.y);
  const after = await motionState();
  const back = await page.locator('[data-part="arrange-answer"] [data-part="tile"]').count();
  const sourceFree = await page.locator('[data-part="arrange-bank"] [data-part="tile"]', { hasText: new RegExp(`^${word}$`) }).first().getAttribute("data-state");
  assert(back === 0 && sourceFree !== "used", `the press should have sent ${word} back (answer has ${back}, source ${sourceFree})`);
  assert(after.ghosts === 0 || after.running > 0, "finished animations leave no ghosts behind");
  await slowMotion(false);
  return { duringFlight: moving, afterPress: after };
});

await stage("never blocks: Continue works the instant an answer lands, mid-animation", async () => {
  await slowMotion(true);
  const { kind } = await answerStep(page, { session: SESSION });
  const next = await shownAfter(page, { session: SESSION });
  await slowMotion(false);
  assert(next, "the next step should be showing right after Continue");
  return `${kind}, then ${next}`;
});

await stage("any press finishes every running animation at once", async () => {
  await slowMotion(true);
  await page.locator('[data-part="arrange-bank"] [data-part="tile"]').first().click();
  const before = await motionState();
  await page.mouse.click(5, 300); // an empty spot
  const after = await motionState();
  await slowMotion(false);
  assert(before.running > 0 && after.running === 0 && after.ghosts === 0, `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  return { before: before.running, after: after.running };
});

await stage("a quick session plays through to its summary", async () => {
  const kinds = await playThrough("#study/session/quick");
  await page.waitForSelector(".lx-moved-row");
  await page.waitForTimeout(1200);
  await shot("04-session-summary-phone");
  const moved = await page.locator(".lx-moved-row").count();
  await page.locator(`${SESSION} [data-part="answer-bar"]`).getByRole("button", { name: "Done" }).click();
  await pastReminderAsk(page);
  await page.waitForFunction(() => location.hash === "#study" && !document.querySelector('[data-part="session"]:not([data-ghost])'));
  return `${kinds.join(", ")}; ${moved} concepts moved`;
});

await stage("every game plays through: choose, arrange, place, fill, match, type, listen, say, repeat, cards", async () => {
  const played = {};
  for (const hash of ["game/choose", "game/arrange", "game/place", "game/fill", "game/match", "game/type", "game/listen", "game/say", "game/repeat", "cards"]) {
    try {
      played[hash] = (await playThrough(`#study/session/${hash}`)).length;
      await page.locator(`${SESSION} [data-part="answer-bar"]`).getByRole("button", { name: "Done" }).click({ timeout: 5000 });
      await pastReminderAsk(page);
      // Done steps the history back to Study; the next game goes from there once it has. Straight on, the next game's entry came before that step
      // back landed, which then went one entry off: the browser's history and the router's record apart for the rest of the run (v96).
      await page.waitForFunction(() => {
        const nav = globalThis.__lxNav?.();
        return location.hash === "#study" && !document.querySelector('[data-part="session"]:not([data-ghost])') && nav && !nav.afresh && nav.routes[nav.i] === "#study";
      }, null, { timeout: 10_000 });
    } catch (error) {
      await shot(`fail-${hash.replace("/", "-")}`);
      throw new Error(`${hash}: ${error.message.split("\n")[0]}`);
    }
  }
  return played;
});

await stage("wrong answers: feedback, the right order, the typing diff", async () => {
  await goFresh(`#study/session/game/arrange`);
  await page.waitForSelector('[data-part="arrange-bank"]');
  const item = await currentItem();
  for (const word of [...(await arrangeAnswer(item))].reverse()) {
    await page.locator('[data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])', { hasText: new RegExp(`^${escape(word)}$`) }).first().click();
  }
  await page.getByRole("button", { name: "Check" }).click();
  assert(await page.locator('[data-part="arrange-key"]').count(), "the right order should show");
  assert((await page.getAttribute('[data-part="answer-bar"]', "data-meaning")) === "wrong", "answer bar says wrong");
  await page.waitForTimeout(1300);
  await shot("05-arrange-wrong");
  await goFresh(`#study/session/game/type`);
  await page.waitForSelector('[data-part="type-answer"] input');
  await page.locator('[data-part="type-answer"] input').fill("xyz");
  await page.locator('[data-part="type-answer"] input').press("Enter");
  const marked = await page.locator(`${SESSION} .lx-said [data-part="said-word"]`).evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-state")));
  assert(marked.length && marked.some((state) => state === "wrong" || state === "missing"), `your typing, word by word: ${marked}`);
  await page.waitForTimeout(900);
  await shot("06-type-wrong");
  return `key shown; typing marked word by word (${marked.join(" ")})`;
});

await stage("games in detail: stray tile, dragging, where it goes, forgiving typing, listening", async () => {
  const report = {};
  const setStudy = (path, value) => page.evaluate(([p, v]) => import("/js/study/settings.js").then((m) => m.setStudySetting(p, v)), [path, value]);
  const center = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const drag = async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 4, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(60);
  };
  // Arrange, Dutch words with a stray: one more tile than the sentence has words; dragging puts a tile where you drop it
  // and reorders what's placed; the right order is right, with the stray left in the bank.
  await setStudy("arrange.tiles", "dutch");
  await goFresh(`#study/session/game/arrange`);
  await page.waitForSelector(`${SESSION} [data-part="arrange-bank"]`);
  const item = await currentItem();
  const words = item.words.map(([t]) => t);
  const bankTiles = await page.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]`).allTextContents();
  const stray = bankTiles.filter((t) => !words.includes(t));
  assert(bankTiles.length === words.length + 1 && stray.length === 1, `bank ${bankTiles} for ${words}`);
  const bankTile = (word) => page.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])`, { hasText: new RegExp(`^${escape(word)}$`) }).first();
  const placed = () => page.locator(`${SESSION} [data-part="arrange-answer"] [data-part="tile"]`).allTextContents();
  // Tap the 2nd word, then drag the 1st in front of it.
  await bankTile(words[1]).click();
  await drag(await center(bankTile(words[0])), { ...(await center(page.locator(`${SESSION} [data-part="arrange-answer"] [data-part="tile"]`).first())), x: (await page.locator(`${SESSION} [data-part="arrange-answer"] [data-part="tile"]`).first().boundingBox()).x + 4 });
  const afterDragIn = await placed();
  // Tap the rest in order, then drag the last placed tile to the front and back to the end.
  for (const word of words.slice(2)) await bankTile(word).click();
  const answerTiles = page.locator(`${SESSION} [data-part="arrange-answer"] [data-part="tile"]`);
  const firstBox = await answerTiles.first().boundingBox();
  await drag(await center(answerTiles.last()), { x: firstBox.x + 3, y: firstBox.y + firstBox.height / 2 });
  const afterReorder = await placed();
  const lastBox = await answerTiles.last().boundingBox();
  const rowBox = await page.locator(`${SESSION} [data-part="arrange-answer"]`).boundingBox();
  await drag(await center(answerTiles.first()), { x: rowBox.x + rowBox.width - 6, y: lastBox.y + lastBox.height / 2 });
  const afterReorderBack = await placed();
  await page.locator(SESSION).getByRole("button", { name: "Check" }).click();
  const meaning = await page.getAttribute(`${SESSION} [data-part="answer-bar"]`, "data-meaning");
  report.arrange = { stray: stray[0], afterDragIn, afterReorder, afterReorderBack, meaning };
  assert(afterDragIn.join() === words.slice(0, 2).join(), `drag into place: ${afterDragIn}`);
  assert(afterReorder[0] === words.at(-1) && afterReorderBack.join() === words.join() && meaning === "right", `reorder by dragging: ${afterReorder} → ${afterReorderBack}, ${meaning}`);
  await shot("20-arrange-stray-dragged");
  await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
  // English chunks in Dutch order.
  await setStudy("arrange.tiles", "english");
  await goFresh(`#study/session/game/arrange`);
  await page.waitForSelector(`${SESSION} [data-part="arrange-bank"] [data-part="tile"][lang="en"]`);
  const englishItem = await currentItem();
  const chunks = englishItem.literal.map(([t]) => t);
  for (const chunk of chunks) await bankTile(chunk).click();
  await page.locator(SESSION).getByRole("button", { name: "Check" }).click();
  report.english = await page.getAttribute(`${SESSION} [data-part="answer-bar"]`, "data-meaning");
  assert(report.english === "right", `English in Dutch order: ${report.english}`);
  await shot("21-arrange-english");
  await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
  await setStudy("arrange.tiles", "mix");
  // Where does it go: a wrong gap shows the word there struck through, and where it really goes.
  await goFresh(`#study/session/game/place`);
  await page.waitForSelector(`${SESSION} [data-part="place-gap"]`);
  const placeItem = await currentItem();
  const at = placeIndex(placeItem);
  await page.locator(`${SESSION} [data-part="place-gap"]`).nth(at === 0 ? 1 : 0).click();
  const gapStates = await page.locator(`${SESSION} [data-part="place-gap"][data-state]`).evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-state")));
  report.place = gapStates;
  assert(gapStates.includes("wrong") && gapStates.includes("answer"), `where it goes after a miss: ${gapStates}`);
  await page.waitForTimeout(700);
  await shot("22-place-wrong");
  await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
  // Type it: the whole sentence; forgiving about capitals, full stops and accents.
  await goFresh(`#study/session/game/type`);
  await page.waitForSelector(`${SESSION} [data-part="type-answer"] input`);
  const typeItem = await currentItem();
  const sloppy = typeItem.sentence.toLowerCase().replace(/[.?!]$/, "");
  await page.locator(`${SESSION} [data-part="type-answer"] input`).fill(sloppy);
  await page.locator(`${SESSION} [data-part="type-answer"] input`).press("Enter");
  report.type = await page.getAttribute(`${SESSION} [data-part="answer-bar"]`, "data-meaning");
  assert(report.type === "right", `"${sloppy}" should count: ${report.type}`);
  await shot("23-type-sentence");
  await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
  // Listening: the sentence plays by itself with no text shown; Slower plays at 70%.
  await setStudy("listen.mode", "meaning");
  await goFresh(`#study`);
  await recordSaid(page);
  await page.locator('a[href="#study/session/game/listen"]').click();
  await page.waitForSelector(`${SESSION} .lx-listen-row`);
  const listenItem = await currentItem();
  const listenClips = await clipsOf(page, { item: listenItem.id });
  let heard = [];
  for (let waited = 0; waited < 3000 && !saysItem(heard, listenItem, listenClips); waited += 100) {
    await page.waitForTimeout(100);
    heard = await saidSince(page);
  }
  const textShown = await page.locator(`${SESSION} [data-part="activity"]`).textContent();
  await recordSaid(page);
  await page.locator(`${SESSION} .lx-listen-row [data-part="speak-button"]`, { hasText: "Slower" }).click();
  let slower = [];
  for (let waited = 0; waited < 3000 && !saysItem(slower, listenItem, listenClips, 0.7); waited += 100) {
    await page.waitForTimeout(100);
    slower = await saidSince(page);
  }
  await shot("24-listening");
  // Within reach: the choices sit in the lower half of a phone's screen, above the answer bar.
  const choicesTop = (await page.locator(`${SESSION} [data-part="choice-list"]`).boundingBox()).y / 844;
  // By the whole text: a part of it can be another choice ("How are you?" is in "Hello! How are you?").
  await page.locator(`${SESSION} [data-part="choice"]`, { hasText: new RegExp(`^\\s*${escape(listenItem.means)}\\s*$`) }).click();
  const listenMeaning = await page.getAttribute(`${SESSION} [data-part="answer-bar"]`, "data-meaning");
  await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
  await setStudy("listen.mode", "mix");
  report.listen = { said: heard.map((e) => e.src?.split("/").slice(-2).join("/") ?? `device: ${e.text}`), slower: slower.map((e) => e.rate), listenMeaning, choicesTop: Math.round(choicesTop * 100) / 100 };
  assert(choicesTop >= 0.4, `the choices should sit low, within reach (top at ${choicesTop.toFixed(2)} of the screen)`);
  assert(saysItem(heard, listenItem, listenClips), `Listening should say its sentence as it opens, by its recording or the device's voice: ${JSON.stringify(heard)}`);
  assert(!textShown.includes(listenItem.sentence.replace(/[.?!]$/, "")), "Listening shows no Dutch before you answer");
  assert(saysItem(slower, listenItem, listenClips, 0.7) && listenMeaning === "right", `Slower should say it at 70%: ${JSON.stringify(slower)}; meaning ${listenMeaning}`);
  return report;
});

await stage("one concept and one topic pack sessions start", async () => {
  // A concept: what Choose your concepts and a concept's sheet start (a session on it, #study/session/concept/<unit>).
  await goFresh(`#study/session/concept/${encodeURIComponent("p:present")}`);
  await page.waitForSelector('[data-part="session"]');
  await shot("07-concept-session");
  // Out of it as a person leaves one (its close steps the history back), and on once the router has: a page.goto from inside a session left
  // the router's record an entry longer than the browser's history.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const nav = globalThis.__lxNav?.();
    return !document.querySelector('[data-part="session"]:not([data-ghost])') && nav && !nav.afresh && nav.routes[nav.i] === `#${location.hash.slice(1).split("?")[0]}`;
  }, null, { timeout: 10_000 });
  // A pack written for its words by itself (Study by topic's way in): its next lesson.
  const packId = await page.evaluate(async () => (await import("/js/study/content.js")).WORD_PACKS[0]?.id ?? null);
  assert(packId, "no pack written for its words on this server");
  await goFresh(`#study/session/pack/${encodeURIComponent(packId)}`);
  await page.waitForSelector('[data-part="session"]');
  return `a concept, and ${packId} by itself`;
});

const page_ = () => page.locator('[data-part="page"]');
// Back from a Settings page lands on the menu; when it doesn't, where it did.
const backToMenu = (from) =>
  page.waitForFunction(() => location.hash === "#settings" && document.querySelector('[data-part="page-title"]')?.textContent === "Settings", null, { timeout: 10_000 }).catch(async () => {
    const at = await page.evaluate(() => ({ hash: location.hash, title: document.querySelector('[data-part="page-title"]')?.textContent ?? null, nav: globalThis.__lxNav?.() ?? null }));
    await shot(`fail-settings-back-${from.replace(/\W+/g, "-").toLowerCase()}`);
    throw new Error(`back from ${from} never reached the menu: ${JSON.stringify(at)}`);
  });
const row = (title) => page_().locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${title}$`) }) }).first();

await stage("settings: a menu of pages, each with a back link", async () => {
  // From a session (the stage before): Study is a tab's own page reached from elsewhere, so the router steps back through the history first.
  await goRouted(page, BASE, "#study");
  await page.locator('[data-part="settings-button"]').click();
  // Settings' menu is a tab's own page: from Study the router steps the history back first, and its record has the menu once that's done.
  await page.waitForFunction(() => {
    const nav = globalThis.__lxNav?.();
    return location.hash === "#settings" && nav && !nav.afresh && nav.routes[nav.i] === "#settings";
  }, null, { timeout: 10_000 });
  assert((await page.locator('[data-part="page-title"]').textContent()) === "Settings", "the menu's title");
  const titles = await page_().locator(".lx-row-title").allTextContents();
  // Sync across devices is there only where the site offers a store (/api/me's stores, from its config): a copy on someone's own
  // computer (npm run local) offers none, and its menu has no row for it (settings.js; local-copy-check).
  const stores = await page.evaluate(async () => (await (await fetch("/api/me")).json()).stores ?? []);
  for (const t of ["Appearance", "Study", "Language", "AI", ...(stores.length ? ["Sync across devices"] : []), "Downloads", "Your data", "About"]) assert(titles.includes(t), `menu row ${t}`);
  assert(stores.length || !titles.includes("Sync across devices"), "no Sync across devices row where the site offers no store");
  assert((await page.locator('[data-part="app-back"]').textContent()).includes("Study"), "the menu's back link returns to the tab you came from");
  await shot("08-settings-menu");
  const visited = [];
  // The AI row opens the AI section, optional and calm, and goes back to Settings.
  await row("AI").click();
  await page.waitForFunction(() => location.hash === "#ai");
  // Calm with nothing connected: one card to connect, saying it's optional.
  await page.locator('[data-part="ai-practice"][data-variant="connect"]', { hasText: "Optional: everything else works without it." }).waitFor();
  await shot("09-settings-ai");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#settings", "the AI section goes back to Settings");
  await page.locator('[data-part="app-back"]').click();
  await backToMenu("the AI section");
  for (const [title, hash] of [["Appearance", "#settings/appearance"], ["Study", "#settings/study"], ...(stores.length ? [["Sync across devices", "#settings/storage"]] : []), ["Your data", "#settings/data"], ["About", "#settings/about"], ["Language", "#settings/language"]]) {
    await row(title).click();
    await page.waitForFunction(([h, t]) => location.hash === h && document.querySelector('[data-part="page-title"]')?.textContent === t, [hash, title], { timeout: 5000 });
    await shot(`09-settings-${hash.split("/")[1]}`);
    await page.locator('[data-part="app-back"]').click();
    await backToMenu(title);
    visited.push(title);
  }
  return `${visited.length} pages, each back to the menu`;
});

await stage("settings: animations off means nothing animates at all", async () => {
  await goFresh(`#settings/appearance`);
  await page.waitForSelector('[data-part="theme-swatch"]');
  await page_().locator(".lx-row-choice", { hasText: "Animations" }).getByRole("button", { name: "Off", exact: true }).click();
  assert((await page.getAttribute("html", "data-motion")) === "off", "data-motion=off");
  await goFresh(`#study/session/game/arrange`);
  await page.waitForSelector('[data-part="arrange-bank"]');
  await page.locator('[data-part="arrange-bank"] [data-part="tile"]').first().click();
  const state = await motionState();
  const css = await page.evaluate(() => document.getAnimations().length);
  assert(!state.on && state.running === 0 && state.ghosts === 0 && css === 0, JSON.stringify({ ...state, css }));
  await goFresh(`#settings/appearance`);
  await page_().locator(".lx-row-choice", { hasText: "Animations" }).getByRole("button", { name: "Match device", exact: true }).click();
  // The theme swatches pick the theme.
  await page.locator('[data-part="theme-swatch"][data-theme-id="paper"]').click();
  // Switching keeps the look it leaves in Recent looks first, so it lands a moment after the press.
  const paper = await page.waitForFunction(() => document.documentElement.dataset.theme === "paper", null, { timeout: 5000 }).then(() => "paper", () => page.getAttribute("html", "data-theme"));
  await page.locator('[data-part="theme-swatch"][data-theme-id="graphite"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "graphite", null, { timeout: 5000 });
  assert(paper === "paper", "the Paper swatch picks Paper");
  return "no animations, no ghosts; swatches pick the theme";
});

await stage("the quick session's settings change what's in it", async () => {
  await goFresh(`#settings/study/quick?from=study`);
  await page.waitForSelector(".lx-quick-preview");
  const before = await page.evaluate(async () => (await import("/js/study/plan.js")).planSession("quick").steps.length);
  assert((await page.locator('[data-part="app-back"]').textContent()).includes("Study"), "back goes to Study");
  // Only Choose, short.
  // Every way but Choose (read from the app, so a new way is never missed).
  const ways = await page.evaluate(async () => Object.values((await import("/js/study/settings.js")).WAYS));
  for (const way of ways.filter((w) => w !== "Choose")) {
    await page_().locator("label.lx-row-control", { hasText: way }).click();
  }
  await page_().locator(".lx-row-choice", { hasText: "How long" }).getByRole("button", { name: "Short", exact: true }).click();
  const icons = Number(await page.locator(".lx-quick-preview [data-steps]").getAttribute("data-steps"));
  // Turning off the last one is refused.
  await page_().locator("label.lx-row-control", { hasText: "Choose" }).click();
  const stillOn = await page_().locator("label.lx-row-control", { hasText: "Choose" }).locator("input").isChecked();
  await page.locator('[data-part="app-back"]').click();
  await page.waitForFunction(() => location.hash === "#study");
  const plan = await page.evaluate(async () => (await import("/js/study/plan.js")).planSession("quick").steps.map((s) => s.kind));
  assert(stillOn, "the last way can't be turned off");
  assert(plan.length > 0 && plan.every((k) => k === "choose"), `only choose steps: ${plan}`);
  assert(icons === plan.length, `the settings page previewed ${icons} steps; the plan has ${plan.length}`);
  await shot("10-quick-settings-effect");
  // Back to the defaults for the rest of the run.
  await page.evaluate(async () => (await import("/js/study/settings.js")).resetStudySettings());
  return `before ${before} steps; with only Choose, short: ${plan.length} choose steps`;
});

await stage("study cards: flip the Dutch-order line back and forth; its settings apply", async () => {
  // The starter's sentences alone: each has an English order to flip to, where the first cards of Dutch's lessons are single new words.
  const others = await page.evaluate(async () => {
    const [{ ITEMS }, packs] = await Promise.all([import("/js/study/content.js"), import("/js/study/packs.js")]);
    const ids = [...new Set(ITEMS.map((item) => item.pack))].filter((id) => id && id !== "starter-word-order");
    for (const id of ids) packs.setPackOn(id, false);
    return ids;
  });
  try {
    return await studyCards();
  } finally {
    await page.evaluate(async (ids) => {
      const packs = await import("/js/study/packs.js");
      for (const id of ids) packs.setPackOn(id, true);
    }, others);
  }
});
async function studyCards() {
  await goFresh(`#study/session/cards`);
  await page.waitForSelector(`${SESSION} [data-part="study-card"]`);
  // A card whose sentence has an English order to flip to.
  for (let i = 0; i < 6; i++) {
    await page.locator(SESSION).getByRole("button", { name: "Show meaning" }).click();
    if (await page.locator(`${SESSION} [data-part="order-toggle"]`).count()) break;
    await page.locator(SESSION).getByRole("button", { name: /^(I knew it|Continue)$/ }).click();
  }
  const line = page.locator(`${SESSION} [data-part="literal-line"]`);
  const words = () => line.locator('[data-part="literal-chunk"]').allTextContents();
  const dutch = await words();
  // One toggle, pressed on the same spot both times: it flips to English order, then back.
  const toggle = page.locator(`${SESSION} [data-part="order-toggle"]`);
  await toggle.click({ position: { x: 12, y: 12 } });
  const englishOrder = await line.getAttribute("data-order");
  const english = await words();
  await page.waitForTimeout(1200);
  await page.locator(`${SESSION} [data-part="study-card"]`).screenshot({ path: join(OUT, "shots", "11-card-english-order.png") });
  await toggle.click({ position: { x: 12, y: 12 } });
  const back = await words();
  assert(englishOrder === "english" && english.join() !== dutch.join() && back.join() === dutch.join(), `dutch ${dutch} / english ${english} / back ${back}`);
  // Settings: line off, then the card has no line and no switch.
  await goFresh(`#settings/study/cards`);
  await page.waitForSelector(".lx-card-preview [data-part='study-card']");
  await page_().locator("label.lx-row-control", { hasText: "Show the Dutch-order line" }).click();
  await page.waitForTimeout(100);
  const off = await page.locator(".lx-card-preview [data-part='study-card']").getAttribute("data-literal");
  const switches = await page.locator('.lx-card-preview [data-part="order-toggle"]').count();
  await page_().locator("label.lx-row-control", { hasText: "Show the Dutch-order line" }).click();
  await page.waitForTimeout(1500);
  await shot("12-card-settings");
  assert(off === "off" && switches === 0, `line off: data-literal ${off}, switches ${switches}`);
  return `${dutch.join(" ")} ⇄ ${english.join(" ")}`;
}

await stage("voices: a pack's recordings take turns (or a pin), the device voice is yours, words light up, cards and answers play", async () => {
  const playback = () => page.evaluate(async () => (await import("/js/study/voice.js")).playbackState());
  const sample = '.lx-listening-sample [data-part="speak-button"]';
  {
    // The Voices page: a recordings switch, and this device's voices (each with its own speak button). No pack's
    // recorded voices are listed as choices: they belong to the pack.
    await goFresh(`#settings/study/voices`);
    await page.waitForSelector(".lx-listening-sample");
    await page.waitForFunction(() => document.querySelector(".lx-voice-groups [part], .lx-voice-groups [data-part]"));
    const radios = await page.locator('label:has([name="device-voice"]) .lx-row-title').allTextContents();
    assert(!radios.some((t) => /Emma|Ido/.test(t)), `recorded voices shouldn't be settings choices: ${radios}`);
    const recordedOn = await page.locator("label.lx-row-control", { hasText: "Play a pack's recordings" }).locator("input").isChecked();
    assert(recordedOn, "recordings are on by default");
    // The sample: a recording (one of the pack's voices) plays and every word lights up in turn, then nothing is lit.
    await page.locator(sample).click();
    const lit = await page.evaluate(
      async () => {
        const { playbackState } = await import("/js/study/voice.js");
        return new Promise((resolve) => {
          const line = document.querySelector('.lx-listening-sample [data-part="spoken-line"]');
          const button = line.querySelector('[data-part="speak-button"]');
          const words = [...line.querySelectorAll('[data-part="spoken-word"]')];
          const order = [];
          const started = performance.now();
          let playing = false;
          let src = "";
          const tick = () => {
            const i = words.findIndex((w) => w.hasAttribute("data-speaking"));
            if (i !== -1 && order.at(-1) !== i) order.push(i);
            if (button.getAttribute("data-state") === "playing") {
              playing = true;
              src = playbackState().src;
            } else if (playing) return resolve({ order, words: words.length, src, ms: Math.round(performance.now() - started), cleared: words.every((w) => !w.hasAttribute("data-speaking")) });
            if (performance.now() - started > 8000) return resolve({ order, words: words.length, timeout: true });
            requestAnimationFrame(tick);
          };
          tick();
        });
      },
    );
    assert(!lit.timeout && lit.cleared && lit.order.join() === [...Array(lit.words).keys()].join(), `words lit: ${JSON.stringify(lit)}`);
    assert(playsOneOf(lit.src, await clipsOf(page, { item: "morgen-oma" })), `the sample played ${lit.src}`);
    // The pack's voices take turns across sentences; a pin keeps one, and survives a reload; then back to taking turns.
    const voicesFor = () => page.evaluate(async () => {
      const [{ ITEMS }, voice] = await Promise.all([import("/js/study/content.js"), import("/js/study/voice.js")]);
      await voice.loadAudio();
      return [...new Set(ITEMS.map((item) => voice.recordedVoiceFor(item.id)?.slug))];
    });
    const mixed = await voicesFor();
    await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("listening.pins.starter-word-order", "ido"));
    await page.reload();
    await page.waitForSelector(".lx-listening-sample");
    const pinned = await voicesFor();
    await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("listening.pins", {}));
    assert(mixed.length === 2 && pinned.join() === "ido", `turns: ${mixed}; pinned: ${pinned}`);
    // Pressing the sample again stops it (once it's playing: up to 2 s, the clip's first part through the worker).
    await page.locator(sample).click();
    let playingNow = await playback();
    for (let i = 0; i < 40 && !(!playingNow.paused && playingNow.time > 0); i++) {
      await page.waitForTimeout(50);
      playingNow = await playback();
    }
    await page.locator(sample).click();
    const stopped = await playback();
    assert(!playingNow.paused && playingNow.time > 0 && stopped.paused && (await page.locator(sample).getAttribute("data-state")) === null, `stop: ${JSON.stringify(playingNow)} then ${JSON.stringify(stopped)}`);
    // Slower plays at 80%.
    await page.locator('[data-part="segment"]', { hasText: "Slower" }).click();
    await page.locator(sample).click();
    await page.waitForTimeout(150);
    const slow = await playback();
    await page.locator(sample).click();
    await page.locator('[data-part="segment"]', { hasText: "Normal" }).click();
    assert(slow.rate === 0.8, `slower plays at ${slow.rate}`);
    // This device's voice: picking one saves it, and its own speak button speaks with it (headless Chrome on a Mac has
    // the system's Dutch voices). With recordings off, the sample speaks with the device voice too.
    const deviceRows = page.locator('label:has([name="device-voice"])');
    let device = "no device voice in this browser";
    if (await deviceRows.count()) {
      const last = deviceRows.last();
      const name = (await last.locator(".lx-row-title").textContent()).trim();
      await last.locator('[data-part="radio"]').check();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.study.v1")).listening.device);
      const button = deviceRows.last().locator('[data-part="speak-button"]');
      // Whether the device's voice speaks within 4 s, polled inside the page (never an async predicate in
      // waitForFunction, which resolves at once: scripts/test-check-waits.mjs).
      const deviceSpeaks = () =>
        page.evaluate(async () => {
          const voice = await import("/js/study/voice.js");
          for (let i = 0; i < 80; i++) {
            if (voice.playbackState().device) return true;
            await new Promise((done) => setTimeout(done, 50));
          }
          return false;
        });
      await button.click();
      const spoke = await deviceSpeaks();
      await page.waitForFunction((b) => b.getAttribute("data-state") !== "playing", await button.elementHandle(), { timeout: 12000 });
      await page.locator("label.lx-row-control", { hasText: "Play a pack's recordings" }).click();
      await page.locator(sample).click();
      const offSpoke = await deviceSpeaks();
      await page.locator(sample).click();
      await page.locator("label.lx-row-control", { hasText: "Play a pack's recordings" }).click();
      await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("listening.device", ""));
      assert(saved && spoke && offSpoke, `device voice ${name}: saved ${saved}, spoke ${spoke}, with recordings off ${offSpoke}`);
      device = `${name} saved and spoke; recordings off → device voice`;
    }
    await shot("14-voices-settings");

    // A study card's sentence plays by itself when the card appears (the session started by a press, as in real use),
    // and the card's words light up; its speak button stops it.
    await goFresh(`#study`);
    await recordSaid(page);
    // The device's voice held speaking until it's stopped (the checks' silent voice otherwise ends at once, and a press would start it again).
    await page.evaluate(() => (globalThis.__lxHold = true));
    await page.locator('[data-part="way-tile"][data-game="card"]').click();
    const cardButton = `${SESSION} [data-part="study-card"] [data-part="speak-button"]`;
    await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute("data-state") === "playing", cardButton, { timeout: 4000 });
    // A card with a recording lights its words by the recording's timings; one without is said by the device's voice, whose words light
    // only where the browser reports them (the checks' silent voice never does): that one must be said, its sentence word for word.
    const cardItem = await currentItem();
    const cardClips = await clipsOf(page, { item: cardItem.id });
    const recorded = (await saidSince(page)).some((e) => e.src && playsOneOf(e.src, cardClips));
    if (recorded) await page.waitForSelector(`${SESSION} [data-part="target-word"][data-speaking]`, { timeout: 4000 });
    else assert(saysItem(await saidSince(page), cardItem, cardClips), `the card's sentence wasn't said: ${JSON.stringify(await saidSince(page))}`);
    await shot("15-card-speaking");
    // Pressed again while it speaks, it stops: its clip paused, or the device's voice canceled. A clip over by now is started again first,
    // so the press is a stop and not a start.
    if ((await page.locator(cardButton).getAttribute("data-state")) !== "playing") {
      await page.locator(cardButton).click();
      await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute("data-state") === "playing", cardButton, { timeout: 4000 });
    }
    const cardBefore = await playback();
    if (recorded && !(!cardBefore.paused && playsOneOf(cardBefore.src, cardClips))) {
      await page.evaluate(() => (globalThis.__lxHold = false));
      throw new Error(`the card's clip isn't playing before the press: ${JSON.stringify(cardBefore)}`);
    }
    await recordSaid(page);
    await page.locator(cardButton).click();
    const cardAfter = await playback();
    const canceled = (await saidSince(page)).some((e) => e.cancel);
    // The button shows it stopped at once (within a second; it says how long).
    const buttonState = await page.evaluate(async (sel) => {
      const start = performance.now();
      while (performance.now() - start < 1000 && document.querySelector(sel)?.getAttribute("data-state") === "playing") await new Promise((done) => setTimeout(done, 10));
      const state = document.querySelector(sel)?.getAttribute("data-state") ?? null;
      return state === null ? null : `${state} after ${Math.round(performance.now() - start)} ms`;
    }, cardButton);
    await page.evaluate(() => (globalThis.__lxHold = false));
    assert(buttonState === null && (recorded ? cardAfter.paused && playsOneOf(cardAfter.src, cardClips) : canceled), `pressing the card's speak button again stops it: its button ${buttonState}, ${recorded ? `its clip ${JSON.stringify(cardAfter)}` : `the device voice ${canceled ? "canceled" : "never canceled"}`}`);
    await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
    await page.waitForFunction(() => !document.querySelector('[data-part="session"]:not([data-ghost])'));

    // After an answer, the sentence shows with its speak button and plays by itself. The games are on Study's own page.
    await goFresh(`#study`);
    await page.locator('a[href="#study/session/game/choose"]').click();
    await page.waitForSelector(`${SESSION} [data-part="choice"]`);
    const prompt = await promptText();
    const item = await fresh(() => itemFor(prompt));
    await recordSaid(page);
    await page.locator(`${SESSION} [data-part="choice"]`, { hasText: new RegExp(`^\\s*${escape(item.sentence)}\\s*$`) }).click();
    const answerButton = `${SESSION} [data-part="answer-bar"] [data-part="spoken-line"] [data-part="speak-button"]`;
    await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute("data-state") === "playing", answerButton, { timeout: 4000 });
    // Said as itself: its own recording, or the device's voice for a sentence with none (a word band's; a self-host copy seeds them all).
    // playbackState() alone reads the last recording element, an earlier step's when the device's voice says this one (7 Nov 2026).
    const answerClips = await clipsOf(page, { item: item.id });
    const answerSaid = await saidSince(page);
    await shot("16-answer-spoken");
    assert(saysItem(answerSaid, item, answerClips), `the answer said its own sentence (${answerClips.length} recordings of it here): ${JSON.stringify(answerSaid.slice(-3))}`);
    const byRecording = answerSaid.some((e) => e.src && playsOneOf(e.src, answerClips));
    // Moving on stops it: its recording paused, or the device's voice canceled (or done).
    await recordSaid(page);
    await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).click();
    const answerStopped = byRecording ? (await playback()).paused : (await saidSince(page)).some((e) => e.cancel) || !(await page.evaluate(() => speechSynthesis.speaking));
    assert(answerStopped, `Continue stops the last sentence (${byRecording ? "its recording" : "the device's voice"})`);
    await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
    await page.waitForFunction(() => !document.querySelector('[data-part="session"]:not([data-ghost])'));

    // Match says a Dutch word when you tap it.
    await page.locator('a[href="#study/session/game/match"]').click();
    await page.waitForSelector(`${SESSION} [data-part="match-item"][data-side="nl"]`);
    const word = (await page.locator(`${SESSION} [data-part="match-item"][data-side="nl"]`).first().textContent()).trim();
    // A word with a recording plays it; one without is said by the device voice (playbackState only knows the last clip, which
    // can be the answer's from the game before).
    const wordClips = await clipsOf(page, { word });
    await recordSaid(page);
    await page.locator(`${SESSION} [data-part="match-item"][data-side="nl"]`).first().click();
    const saysWord = (heard) => heard.some((e) => (e.src && playsOneOf(e.src, wordClips)) || (!wordClips.length && e.text && plainText(e.text) === plainText(word)));
    let heard = [];
    for (const t0 = Date.now(); Date.now() - t0 < 3000 && !saysWord(heard); await page.waitForTimeout(100)) heard = await saidSince(page);
    await page.locator(`${SESSION} [data-part="session-bar"] button`).first().click();
    assert(saysWord(heard), `Match said ${JSON.stringify(heard)} for ${word} (${wordClips.length ? "its recording" : "the device voice"})`);
    return `${lit.words} words lit in order over ${lit.ms} ms; voices take turns (${mixed}), pin keeps ${pinned}; stop and slower ${slow.rate}; ${device}; card, answer (${item.id}) and Match (${word}, ${wordClips.length ? "recording" : "device voice"}) played`;
  }
});

await stage("the page scrolls (and bounces) in its own area, the header stays put; a session locks it", async () => {
  await goFresh(`#study`);
  await page.setViewportSize({ width: 390, height: 500 });
  await page.waitForSelector('[data-part="page"] [data-part="list-row"]');
  // The page is its own scroller (it bounces at its ends; contain keeps that from reaching the document), and the
  // document doesn't scroll, so scrolling to the bottom leaves the header exactly where it was.
  const scroller = () =>
    page.evaluate(() => {
      const p = document.querySelector('[data-part="app"] > [data-part="page"]');
      const cs = getComputedStyle(p);
      return { overflow: cs.overflowY, overscroll: cs.overscrollBehaviorY, doc: getComputedStyle(document.documentElement).overflowY, scrolls: p.scrollHeight > p.clientHeight };
    });
  const headerTop = () => page.evaluate(() => document.querySelector('[data-part="app"] > [data-part="app-header"]').getBoundingClientRect().top);
  const before = await scroller();
  const topBefore = await headerTop();
  await page.mouse.move(195, 300);
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(400);
  const scrolledPage = await page.evaluate(() => document.querySelector('[data-part="app"] > [data-part="page"]').scrollTop);
  const topAfter = await headerTop();
  assert(before.overflow === "auto" && before.overscroll === "contain" && before.doc === "hidden" && before.scrolls && scrolledPage > 0 && topAfter === topBefore && (await page.evaluate(() => window.scrollY)) === 0, `scroller ${JSON.stringify(before)}, page scrolled ${scrolledPage}, header ${topBefore} → ${topAfter}`);
  // A page with little on it still scrolls (and so bounces), like any app's: tall screen, short pages.
  await page.setViewportSize({ width: 390, height: 844 });
  const short = {};
  for (const tab of ["today", "read", "know", "explore"]) {
    await goFresh(`#${tab}`);
    await page.waitForSelector("html[data-app-ready]");
    await page.waitForTimeout(150);
    short[tab] = await page.evaluate(() => {
      const p = document.querySelector('[data-part="app"] > [data-part="page"]');
      return p.scrollHeight - p.clientHeight;
    });
  }
  assert(Object.values(short).every((extra) => extra >= 1), `every page can scroll a little: ${JSON.stringify(short)}`);
  await page.setViewportSize({ width: 390, height: 500 });
  // A new page starts at its top. (A tab's own page comes back where you left it: tab-check.mjs.)
  await goFresh(`#today`);
  await goFresh(`#settings/study`);
  await page.waitForFunction(() => location.hash === "#settings/study");
  const backToTop = await page.evaluate(() => document.querySelector('[data-part="app"] > [data-part="page"]').scrollTop);
  assert(backToTop === 0, `a new page opens at its top (${backToTop})`);
  await goFresh(`#study/session/cards`);
  await page.waitForSelector(`${SESSION} [data-part="study-card"]`);
  const locked = await page.evaluate(() => document.documentElement.hasAttribute("data-scroll-lock"));
  const lockedOverflow = await page.evaluate(() => getComputedStyle(document.querySelector('[data-part="app"] > [data-part="page"]')).overflowY);
  await page.mouse.move(195, 250);
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(300);
  const scrolled = await page.evaluate(() => window.scrollY + document.querySelector('[data-part="app"] > [data-part="page"]').scrollTop);
  await page.locator(SESSION).getByRole("button", { name: "End session" }).click();
  const unlocked = await page.evaluate(() => !document.documentElement.hasAttribute("data-scroll-lock"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert(locked && scrolled === 0 && unlocked, `locked ${locked}, page scrolled ${scrolled}, unlocked after ${unlocked}`);
  assert(lockedOverflow === "hidden" && (await scroller()).overflow === "auto", `the page behind a session: ${lockedOverflow}`);
  return `page scrolled ${scrolledPage}px in its own area, header stayed at ${topAfter}px; locked behind a session, unlocked after`;
});

await stage("on a phone: a tapped row doesn't stay highlighted; fields don't zoom", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await phone.addCookies(await context.cookies());
  const tab = await phone.newPage();
  tab.on("console", (m) => m.type() === "error" && problems.push(`console (phone): ${consoleLine(m)}`));
  await tab.goto(`${BASE}/app/#settings/ai`);
  await tab.waitForSelector("summary[data-part='list-row']");
  const hover = await tab.evaluate(() => matchMedia("(hover: hover)").matches);
  const summary = tab.locator("summary[data-part='list-row']").first();
  await summary.tap();
  await tab.waitForTimeout(400);
  const bg = await summary.evaluate((n) => getComputedStyle(n).backgroundColor);
  const field = await tab.locator('[data-part="text-field"]').first().evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  await tab.goto(`${BASE}/app/#study`);
  await tab.waitForSelector('[data-part="study-door"]');
  await tab.screenshot({ path: join(OUT, "shots", "13-phone-study.png") });
  await phone.close();
  assert(!hover, "a phone reports no hover");
  assert(bg === "rgba(0, 0, 0, 0)", `after the tap the row is clear, got ${bg}`);
  assert(field >= 16, `text fields are at least 16px on touch screens, got ${field}`);
  return { hover, afterTap: bg, fieldPx: field };
});

await stage("on a phone: the app never zooms (pinch, double-tap, iOS's gestures), and every field on every page is 16px or more", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await phone.addCookies(await context.cookies());
  const tab = await phone.newPage();
  tab.on("console", (m) => m.type() === "error" && problems.push(`console (phone): ${consoleLine(m)}`));
  // Fields iOS zooms into when one is focused under 16px: text-like inputs, textareas, selects. Hidden ones count
  // (a closed sheet's field opens later).
  const smallFields = () =>
    tab.evaluate(() => {
      const typed = new Set(["", "text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "time", "week"]);
      return [...document.querySelectorAll("input, textarea, select")]
        .filter((n) => n.tagName !== "INPUT" || typed.has((n.getAttribute("type") ?? "").toLowerCase()))
        .map((n) => ({ px: parseFloat(getComputedStyle(n).fontSize), what: `${n.tagName.toLowerCase()}${n.getAttribute("data-part") ? `[${n.getAttribute("data-part")}]` : ""}${n.name ? ` name=${n.name}` : ""}${n.getAttribute("aria-label") ? ` “${n.getAttribute("aria-label")}”` : n.placeholder ? ` “${n.placeholder}”` : ""}` }))
        .filter((f) => !(f.px >= 16));
    });
  const fieldCount = () => tab.evaluate(() => document.querySelectorAll("input, textarea, select").length);
  const small = [];
  const wrong = [];
  let fields = 0;
  let pages = 0;
  const visit = async (where) => {
    pages++;
    fields += await fieldCount();
    for (const f of await smallFields()) small.push(`${where}: ${f.what} at ${f.px}px`);
  };
  const go = async (hash) => {
    await tab.goto(`${BASE}/app/${hash}`);
    await tab.waitForSelector("html[data-app-ready]");
    await tab.waitForTimeout(250);
  };
  // Pinch and double-tap leave the page at its own scale; iOS's gesture events are refused. In a tab of its own: a page
  // that does zoom stays zoomed through the app's own navigation.
  const zoomed = async (where, hash) => {
    const tab = await phone.newPage();
    const cdp = await phone.newCDPSession(tab);
    await tab.goto(`${BASE}/app/${hash}`);
    await tab.waitForSelector("html[data-app-ready]");
    const { x, y } = await tab.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 3 }));
    await cdp.send("Input.synthesizePinchGesture", { x, y, scaleFactor: 2.5, gestureSourceType: "touch" });
    await tab.waitForTimeout(300);
    const afterPinch = await tab.evaluate(() => visualViewport.scale);
    await tab.touchscreen.tap(x, y);
    await tab.waitForTimeout(80);
    await tab.touchscreen.tap(x, y);
    await tab.waitForTimeout(500);
    const afterDoubleTap = await tab.evaluate(() => visualViewport.scale);
    const gesture = await tab.evaluate(() => {
      const event = new Event("gesturestart", { bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
    const meta = await tab.evaluate(() => document.querySelector('meta[name="viewport"]')?.content ?? "");
    const touch = await tab.evaluate(() => getComputedStyle(document.documentElement).touchAction);
    if (afterPinch !== 1 || afterDoubleTap !== 1) wrong.push(`${where} zoomed: pinch to ${afterPinch}, double-tap to ${afterDoubleTap}`);
    if (!gesture) wrong.push(`${where}: iOS's gesturestart isn't refused`);
    if (!/maximum-scale=1\b/.test(meta) || !/user-scalable=no/.test(meta)) wrong.push(`${where}'s viewport allows zoom: ${meta}`);
    if (touch !== "manipulation") wrong.push(`${where}: touch-action ${touch}`);
    await tab.close();
    return { pinch: afterPinch, doubleTap: afterDoubleTap };
  };

  const zoom = { today: await zoomed("Today", "#today"), game: await zoomed("a game", "#study/session/game/choose") };
  // Every tab, every kind of request, a session's typing, a concept's page and its question sheet.
  for (const hash of ["#today", "#study", "#read", "#read/paste", "#ai", "#explore", "#know", "#practice"]) {
    await go(hash);
    await visit(hash);
  }
  // A pack's page in Explore (its sheets: report, share, copy).
  await go("#explore");
  const pack = await tab.locator('[data-part="page"] a.lx-cover-card, [data-part="page"] a.lx-face').first().getAttribute("href", { timeout: 15_000 }).catch(() => null);
  if (pack) {
    await go(pack);
    await visit(pack);
  }
  // With an AI connected (a token, revoked again below), the kinds of request and the question sheet of a "…" turned on.
  const madeToken = await tab.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "app check phone" }) })).json()).summary.id);
  await tab.evaluate(() => localStorage.setItem("lx.ai.ask-anywhere.v1", "on"));
  await tab.reload();
  await tab.waitForSelector("html[data-app-ready]");
  // Every kind with a page of its own (a weave is asked from the reader).
  const kinds = await tab.evaluate(async () => Object.entries((await import("/js/ai/requests.js")).REQUEST_KINDS).filter(([, kind]) => !kind.from).map(([id]) => id));
  for (const kind of kinds) {
    await go(`#ai/new/${kind}`);
    await visit(`#ai/new/${kind}`);
  }
  await knowWords(tab);
  await go("#study/session/game/type");
  await tab.waitForSelector('[data-part="session"] textarea, [data-part="session"] input');
  await visit("a session's typing");
  await go("#know/p%3Av2");
  await tab.locator('[data-part="concept-head"] [aria-haspopup="menu"]').tap();
  await tab.locator('.lx-menu-layer [data-part="menu-item"]', { hasText: "Ask your AI about this" }).tap();
  await tab.waitForSelector(".lx-sheet-layer:not([hidden]) textarea");
  await visit("the ask sheet");
  await tab.keyboard.press("Escape");
  await tab.evaluate(async (id) => {
    localStorage.removeItem("lx.ai.ask-anywhere.v1");
    await fetch(`/api/tokens/${id}`, { method: "DELETE" });
  }, madeToken);
  await tab.reload();
  await tab.waitForSelector("html[data-app-ready]");
  // Every Settings page, found by following Settings' own links (two levels down, at most 60 pages).
  const queue = ["#settings"];
  const done = new Set();
  while (queue.length && done.size < 60) {
    const hash = queue.shift();
    if (done.has(hash)) continue;
    done.add(hash);
    await go(hash);
    await visit(hash);
    const links = await tab.evaluate(() => [...document.querySelectorAll('[data-part="page"] a[href^="#settings/"]')].map((a) => a.getAttribute("href")));
    for (const link of links) if (!done.has(link) && link.split("/").length <= 4) queue.push(link);
  }
  // Signing in and /design (its demos), signed out in their own context.
  const out = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const outTab = await out.newPage();
  for (const path of ["/login", "/design/"]) {
    await outTab.goto(`${BASE}${path}`);
    await outTab.waitForLoadState("networkidle");
    const found = await outTab.evaluate(() => {
      const typed = new Set(["", "text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "time", "week"]);
      const all = [...document.querySelectorAll("input, textarea, select")].filter((n) => n.tagName !== "INPUT" || typed.has((n.getAttribute("type") ?? "").toLowerCase()));
      return { count: all.length, small: all.map((n) => ({ px: parseFloat(getComputedStyle(n).fontSize), what: `${n.tagName.toLowerCase()}${n.getAttribute("data-part") ? `[${n.getAttribute("data-part")}]` : ""}${n.name ? ` name=${n.name}` : ""}${n.className ? ` .${n.className}` : ""}` })).filter((f) => !(f.px >= 16)) };
    });
    pages++;
    fields += found.count;
    for (const f of found.small) small.push(`${path}: ${f.what} at ${f.px}px`);
  }
  await outTab.goto(`${BASE}/login`);
  const loginMeta = await outTab.evaluate(() => document.querySelector('meta[name="viewport"]')?.content ?? "");
  if (!/user-scalable=no/.test(loginMeta)) wrong.push(`signing in can be zoomed: ${loginMeta}`);
  await out.close();
  await phone.close();
  if (small.length) wrong.push(`fields under 16px on a phone (${small.length}):\n  ${small.join("\n  ")}`);
  assert(!wrong.length, wrong.join("\n"));
  return { zoom, pages, fields, settingsPages: done.size };
});

// ---------- speaking: a second Chrome whose microphone is a recording ----------

// A Dutch clip with silence around it, as the WAV Chrome's fake microphone plays (nothing is heard: muted).
const HERE = dirname(fileURLToPath(import.meta.url));
function micFile(mp3, name) {
  const wav = resolve(OUT, `${name}.wav`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-t", "1", "-i", "anullsrc=r=48000:cl=mono", "-i", mp3, "-f", "lavfi", "-t", "2", "-i", "anullsrc=r=48000:cl=mono",
    "-filter_complex", "[1:a]aresample=48000,aformat=channel_layouts=mono[s];[0:a][s][2:a]concat=n=3:v=0:a=1", "-c:a", "pcm_s16le", wav]);
  return wav;
}

/** Plays the first Say it (or Repeat after) step in a fresh Chrome that hears `wav` as its microphone, with `engine`. */
async function sayWith(wav, engine, game = "say") {
  const other = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--mute-audio", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`],
  });
  try {
    // Signed in as the same test account (its cookie), with this device's study data empty.
    const ctx = await other.newContext({ viewport: { width: 390, height: 844 }, storageState: await context.storageState(), permissions: ["microphone"] });
    const p = await ctx.newPage();
    p.on("console", (m) => m.type() === "error" && problems.push(`speaking (${engine}) console: ${m.text()}`));
    p.on("pageerror", (e) => problems.push(`speaking (${engine}) page error: ${e.message}`));
    await p.goto(`${BASE}/app/#study`);
    await knowWords(p);
    await p.waitForSelector('a[href="#study/session/game/say"]');
    const setup = await p.evaluate(async (engine) => {
      (await import("/js/study/settings.js")).setStudySetting("say.engine", engine);
      const api = await import("/js/speech/speech.js");
      const support = await api.support();
      const model = api.recommendedModel(support);
      if (engine === "whisper" && model && (await api.modelState(model)).state !== "ready") await api.downloadModel(model);
      return { support, model };
    }, engine);
    await p.locator(`a[href="#study/session/game/${game}"]`).click();
    const session = p.locator(SESSION);
    await session.locator('[data-part="mic-button"]').waitFor();
    // Repeat after hides the sentence until you've said it; Say it shows it to read.
    const shownBefore = await session.locator('[data-part="activity"] [data-part="spoken-line"]').count();
    // Within reach: the microphone sits in the lower part of the screen, and it's big. Measured once the session is in place: it's a cover
    // that slides up as it opens (session.js runSession).
    await p.waitForFunction((S) => { const node = document.querySelector(S); return Boolean(node) && !node.getAnimations().some((a) => a.playState === "running"); }, SESSION, { timeout: 5000 });
    const micBox = await session.locator('[data-part="mic-button"]').boundingBox();
    const reach = { centreY: Math.round((micBox.y + micBox.height / 2) / 844 * 100) / 100, size: Math.round(micBox.width) };
    const sentence = game === "say" ? (await session.locator('[data-part="spoken-line"] .lx-spoken-text').first().textContent()).trim() : await session.getAttribute("data-item");
    const states = [];
    await p.exposeFunction("lxMicState", (state) => states.push(state));
    await p.evaluate(() => {
      const mic = document.querySelector('[data-part="session"]:not([data-ghost]) [data-part="mic-button"]');
      new MutationObserver(() => window.lxMicState(mic.getAttribute("data-state") ?? "ready")).observe(mic, { attributes: true, attributeFilter: ["data-state"] });
    });
    await session.locator('[data-part="mic-button"]').click();
    await p.waitForFunction(
      () => {
        const root = document.querySelector('[data-part="session"]:not([data-ghost])');
        return root.querySelector('[data-part="said-line"]') || /^(?!Press|Waiting|Getting|Listening|Checking).+/.test(root.querySelector(".lx-say-status")?.textContent ?? "");
      },
      null,
      { timeout: 120000 },
    );
    const words = await session.locator('[data-part="said-word"]').evaluateAll((nodes) => nodes.map((n) => `${n.textContent}:${n.getAttribute("data-state")}`));
    const heard = (await session.locator(".lx-said p").last().textContent().catch(() => "")).trim();
    // The status line lives in the bar, which turns into the feedback once the step is done.
    const status = ((await session.locator(".lx-say-status").textContent({ timeout: 1000 }).catch(() => "")) ?? "").trim();
    const feedback = (await session.locator('[data-part="answer-bar"] [data-part="feedback-title"]').textContent({ timeout: 1000 }).catch(() => null))?.trim() ?? null;
    // Say it reading a shown sentence records as read-aloud: the pronunciation track (skill sound).
    const evidence = await p.evaluate(async (activity) => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.activity === (activity === "say" ? "read-aloud" : activity)).map((row) => `${row.concept}:${row.outcome}:${row.skill}`), game);
    await p.screenshot({ path: join(OUT, "shots", `17-${game}-${engine}-${wav.includes("wrong") ? "wrong" : "right"}.png`) });
    return { sentence, shownBefore, reach, words, heard, status, feedback, evidence, states: [...new Set(states)], support: setup.support, model: setup.model };
  } finally {
    await other.close();
  }
}

await stage("speaking: Say it hears a real Dutch voice with each recognizer, a wrong order is caught, Repeat after too", async () => {
  const PACK = resolve(HERE, "../public/audio/starter-word-order/emma");
  // A fresh device's first Say it sentence is the deck's first.
  const right = micFile(join(PACK, "boek-gelezen.mp3"), "mic-boek-gelezen");
  const wrong = micFile(resolve(HERE, "fixtures/wrong-orders/boek-gelezen-wrong-1.mp3"), "mic-boek-gelezen-wrong");
  const report = {};
  // Whisper, on the device: the right sentence is right, every word heard; the wrong order is caught.
  const whisper = await sayWith(right, "whisper");
  report.whisper = whisper;
  assert(whisper.sentence === "Ik heb gisteren een boek gelezen.", `the first sentence was ${whisper.sentence}`);
  // Centered in the space under the sentence (not up at the top), and wide.
  assert(whisper.reach.centreY >= 0.45 && whisper.reach.centreY <= 0.8 && whisper.reach.size >= 280, `the speak button should be wide and in the middle of the screen: ${JSON.stringify(whisper.reach)}`);
  assert(whisper.feedback?.startsWith("Right") && whisper.words.every((w) => /:(right|close)$/.test(w)), `Whisper: ${JSON.stringify(whisper)}`);
  // Whisper goes into memory before the microphone is opened (on an iPhone, loading it alongside the microphone prompt
  // froze the app).
  assert(whisper.states.indexOf("loading") !== -1 && whisper.states.indexOf("loading") < whisper.states.indexOf("listening"), `Whisper's states: ${whisper.states}`);
  // Read aloud, it's how you sound: the words go to the pronunciation track, and the grammar is only met.
  assert(whisper.evidence.includes("p:perfect:met:sound") && whisper.evidence.includes("w:gisteren:right:sound") && !whisper.evidence.some((e) => /:(read|say|hear)$/.test(e)), `Whisper evidence: ${whisper.evidence}`);
  const whisperWrong = await sayWith(wrong, "whisper");
  report.whisperWrong = whisperWrong;
  assert(!whisperWrong.feedback && whisperWrong.words.some((w) => /:(order|wrong|missing)$/.test(w)) && whisperWrong.evidence.includes("p:perfect:met:sound") && whisperWrong.evidence.includes("w:lezen:right:sound"), `Whisper, wrong order: ${JSON.stringify(whisperWrong)}`);
  // The browser's recognizer (Chrome's goes to Google's servers, fed the same microphone): right is right, and the
  // wrong order never passes.
  const browser = await sayWith(right, "browser");
  report.browser = browser;
  assert(browser.feedback?.startsWith("Right") && browser.words.every((w) => /:(right|close)$/.test(w)), `browser recognizer: ${JSON.stringify(browser)}`);
  const browserWrong = await sayWith(wrong, "browser");
  report.browserWrong = browserWrong;
  assert(!browserWrong.feedback && browserWrong.words.some((w) => /:(order|wrong|missing)$/.test(w)), `browser recognizer, wrong order: ${JSON.stringify(browserWrong)}`);
  // Repeat after: the sentence is heard, not shown, until you've said it back; Whisper hears it right.
  const repeat = await sayWith(right, "whisper", "repeat");
  report.repeat = repeat;
  assert(repeat.sentence === "boek-gelezen" && repeat.shownBefore === 0 && repeat.feedback?.startsWith("Right") && repeat.evidence.includes("p:perfect:met:sound"), `Repeat after: ${JSON.stringify(repeat)}`);
  writeFileSync(join(OUT, "speaking.json"), JSON.stringify(report, null, 2));
  // Its settings page: both recognizers, Whisper's model and download, a place to try it.
  await goFresh(`#settings/study/speaking`);
  await page.waitForFunction(() => document.querySelectorAll('input[data-part="radio"][name="engine"]').length === 2);
  const engines = await page.locator('label:has([name="engine"]) .lx-row-title').allTextContents();
  assert(engines.join() === "This browser's recognizer,Whisper, on this device", `recognizers listed: ${engines}`);
  await shot("18-speaking-settings");
  // Say it's options are part of Speaking (6 Nov): its old address opens Speaking, back to Games, with the game's options under its name.
  await goFresh(`#settings/study/say`);
  await page.waitForFunction(() => location.hash === "#settings/study/speaking?from=games" && document.querySelector('section[aria-label="Say it"]')?.textContent.includes("The sentence"));
  assert((await page.locator('[data-part="app-back"]').first().innerText()).includes("Games"), "Say it's old address should go back to Games");
  await shot("19-say-settings");
  return `Whisper (${whisper.model}, ${whisper.support.whisper.state}): ${whisper.feedback}, ${whisper.heard}; wrong order: ${whisperWrong.words.join(" ")}. Browser (${browser.support.browser.state}): ${browser.feedback}, ${browser.heard}; wrong order: ${browserWrong.words.join(" ")}`;
});

await stage("settings: name, passkeys, tokens", async () => {
  await goFresh(`#settings/account`);
  await page.getByRole("button", { name: "Change your name" }).click();
  await page.waitForSelector('input[aria-label="Your name"]');
  await page.fill('input[aria-label="Your name"]', "App Check Two");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => document.querySelector(".lx-settings-message")?.textContent.includes("Name saved"));
  const passkeys = await page_().locator(".lx-row-title", { hasText: /passkey/i }).count();
  await row("Add a passkey on this device").click();
  // Its own result, not the "Name saved" before it: this authenticator already holds the account's passkey.
  await page.waitForFunction(() => document.querySelector(".lx-settings-message")?.textContent.includes("already has a passkey"));
  const passkeyMessage = await page.locator(".lx-settings-message").textContent();
  await goFresh(`#settings/ai`);
  await page_().locator(".lx-quiet-more > summary", { hasText: "Personal tokens" }).click(); // a press away on that page
  await page.fill(`input[aria-label="New personal token's name"]`, "check token");
  await page_().getByRole("button", { name: "Create token" }).click();
  await page.waitForSelector(".lx-secret");
  const tokenShown = (await page.locator(".lx-secret").textContent()).startsWith("lct_");
  await page_().getByRole("button", { name: "Revoke" }).first().click();
  await page.waitForFunction(() => document.querySelector('[data-part="page"]').textContent.includes("No tokens."));
  return { passkeys, passkeyMessage: passkeyMessage.trim(), tokenShown };
});

let exportPath = null;
await stage("export everything: account plus this device's study and appearance", async () => {
  await goFresh(`#settings/data`);
  await page.waitForSelector('[data-part="page-title"]');
  const [download] = await Promise.all([page.waitForEvent("download"), row("Download everything").click()]);
  exportPath = join(OUT, download.suggestedFilename());
  await download.saveAs(exportPath);
  const file = JSON.parse(readFileSync(exportPath, "utf8"));
  assert(file.format === "lexicommons-account-export" && file.account.name === "App Check Two", "account in the export");
  assert(file.passkeys.length >= 1 && !JSON.stringify(file.passkeys).includes("public_key"), "passkeys without key material");
  assert(file.device.studyEvidence.length > 20, `study evidence: ${file.device.studyEvidence.length}`);
  const settingsVersion = await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().version);
  assert(Number.isInteger(settingsVersion) && file.device.studySettings?.version === settingsVersion, `study settings in it, at the version the app writes (${settingsVersion})`);
  assert(!/lct_[A-Za-z0-9_-]{20,}/.test(JSON.stringify(file)), "no token secrets in the export");
  assert(file.device.theme.format === "lexicommons-theme", "the look is in it");
  return `${download.suggestedFilename()}: ${file.device.studyEvidence.length} answers, ${file.passkeys.length} passkey(s)`;
});

let problemsBeforeDelete = 0;
await stage("delete the account: two presses, signed out, nothing left", async () => {
  problemsBeforeDelete = problems.length;
  // Deleting your account lives on Account (the 6 Nov audit), red from the start.
  await goFresh(`#settings/account`);
  await page.waitForSelector('[data-part="page-title"]');
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  assert(await page.getByText("Your account has been deleted.").isVisible(), "the sign-in page says so");
  const me = await page.evaluate(async () => (await fetch("/api/me")).status);
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("lx.") || k.startsWith("lc_")));
  assert(me === 401 && left.length === 0, `me ${me}, left ${left}`);
  return "401 after, device data cleared";
});

await stage("no stray \"null\" or \"undefined\" text on any screen we visited", async () => {
  assert(!strayText.length, `stray text: ${strayText.slice(0, 5).join(" · ")}`);
  return "none";
});

await stage("no console errors", async () => {
  // After the delete, this check's own fetch of /api/me is a 401 by design; everything before it must be clean.
  const after = problems.slice(problemsBeforeDelete).filter((p) => !/status of 401/.test(p));
  const real = [...problems.slice(0, problemsBeforeDelete), ...after];
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "app-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
