// Checks new languages in the app end to end, in headless Chrome on a LOCAL server (it writes an admin account into the
// server's D1 and signs up a learner, deleting both at the end, so never point it at the live site). For each language
// given, its starter (packs/starter-<code>.json):
//   - published as a default pack the way an admin publishes it (library_upload, the script it gives, library_check,
//     library_publish over MCP), so the catalog lists it and Explore indexes it;
//   - found in Explore under its language, flag and all, and added from its page, as a learner would;
//   - picked in Settings → Language, after which every screen names the language: the Settings menu, Study's ways,
//     Practice, the Read shelf, Explore, and each game's prompt and its text's lang;
//   - studied: the quick session and every game, each step answered (as packs-check does), every evidence row in the
//     language;
//   - heard: the device voice is asked for the module's locale (a Tagalog voice for fil-PH, as phones tag it), through a
//     speech engine that only records what it was asked to say (and Chrome runs muted besides): nothing is heard.
// At the end the catalog is restored to the revision found (library_restore, so Explore's index follows; left alone when
// the run published only what was listed already, as on a state seeded with the library) and must equal the catalog
// found, byte for byte, each starter listed (or not) and in Explore's index (or not) as it was at the start; the learner is deleted in Settings, the admin from D1. Fails on any console error.
//
//   node scripts/lang-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir> --langs sv,nb,da
//        [--packs <dir with starter-<code>.json>]   (default: this app's packs/)
// The server as app/AGENTS.md has it (--local-upstream, GATE_ENABLED:false, PUBLIC_ORIGIN, RP_ID, UPLOAD_SIGNING_SECRET).
// Headless Chrome goes through the channel's parallel lane (gpu.py run --kind parallel). Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { localR2 } from "./fixtures/local-r2.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { stepTitle } from "./fixtures/step-text.mjs";
import { answerStep, nextStep } from "./fixtures/play-session.mjs";
import { goRouted } from "./fixtures/routed.mjs";
import { LANGUAGES } from "../public/js/lang/index.js";
import { flagOf } from "../public/js/lang/flags.js";
import { checkPack } from "../public/js/study/pack-format.js";

const argv = process.argv.slice(2);
const [BASE, outArg = "lang-check-out"] = argv;
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const OUT = resolve(outArg);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const PACKS = resolve(opt("packs") ?? join(APP, "packs"));
const LANGS = (opt("langs") ?? "").split(",").filter(Boolean);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !PERSIST || !LANGS.length) {
  console.error("Usage: lang-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> --langs sv,nb,da [--packs <dir>]\n(it writes accounts into that state, so only a local server)");
  process.exit(2);
}
for (const code of LANGS) if (!LANGUAGES[code]) throw new Error(`${code} isn't in the registry`);
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
const warnings = [];
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
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- the local state: an admin written into D1, and the library ----------

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const wrangler = (args) => execFileSync("npx", ["wrangler", ...args, "--local", "--persist-to", PERSIST], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sql = (command) => {
  const out = wrangler(["d1", "execute", "lexicommons", "--json", "--command", command]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const scratch = mkdtempSync(join(tmpdir(), "lang-check-"));
// The library's bucket through one local R2 in this process (scripts/fixtures/local-r2.mjs), not a wrangler launch per object.
const r2 = localR2(APP, PERSIST);
const libraryGet = (key) => r2.getText("lexicommons-library", key);
const libraryPut = (key, text) => r2.put("lexicommons-library", key, text, "application/json");


const run = randomBytes(3).toString("hex");
const ADMIN = { id: `lck${run}${randomBytes(4).toString("hex")}`, token: `lct_${randomBytes(24).toString("base64url")}` };
const now = Date.now();
sql(
  [
    `INSERT INTO users (id, name, created_at) VALUES (${q(ADMIN.id)}, 'Lang check admin', ${now})`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(ADMIN.id)}, 'lang check', ${q(sha256(ADMIN.token))}, ${q(ADMIN.token.slice(0, 10))}, ${now}, 1)`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(ADMIN.id)}, 'admin', ${now}, 'd1', 'lang-check')`,
  ].join("; "),
);

async function rpc(method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
async function must(name, args = {}) {
  const { result, error } = await rpc("tools/call", { name, arguments: args });
  if (error) throw new Error(`${name}: ${error.message}`);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  const text = result.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
/** Stages one file through library_upload and runs the script it gives, from a folder holding it under its name. */
async function stageFile(path, name) {
  const bytes = readFileSync(path);
  const file = { name, type: "application/json", size: bytes.length, sha256: sha256(bytes) };
  const staged = await must("library_upload", { files: [file] });
  if (staged.script) {
    const dir = mkdtempSync(join(tmpdir(), "lang-check-up-"));
    cpSync(path, join(dir, name));
    writeFileSync(join(dir, "send.sh"), staged.script);
    const output = execFileSync("sh", ["send.sh"], { cwd: dir }).toString();
    rmSync(dir, { recursive: true, force: true });
    const answers = output.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line.replace(/^[^{]*/, "")));
    assert(answers.length === staged.toSend && answers.every((a) => a.ok), `the upload script's answers: ${output.slice(0, 400)}`);
  }
  return file.sha256;
}

// ---------- the browser ----------

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
// A speech engine that only records: what it was asked to say, in which language and voice. One voice per language
// checked, tagged as a phone tags it (its module's locale, but Filipino voices are fil-PH, which Tagalog reads), plus
// English and Dutch, as a phone might have.
const DEVICE_TAGS = { tl: "fil-PH" };
const voiceTag = (code) => DEVICE_TAGS[code] ?? LANGUAGES[code].locale;
const VOICES = [
  ...LANGS.map((code) => ({ name: `Fake ${LANGUAGES[code].name}`, lang: voiceTag(code), voiceURI: `fake-${code}`, localService: true, default: false })),
  { name: "Fake Samantha", lang: "en-US", voiceURI: "fake-samantha", localService: true, default: true },
  { name: "Fake Xander", lang: "nl-NL", voiceURI: "fake-xander", localService: true, default: false },
];
await context.addInitScript((voices) => {
  const queue = [];
  window.__spoken = [];
  const fake = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => voices,
    speak(u) {
      if (u.text) window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null });
      queue.push(u);
      if (!fake.speaking) next();
    },
    cancel() {
      for (const u of queue.splice(0)) u.onerror?.({ error: "canceled" });
      fake.speaking = false;
    },
    pause() {},
    resume() {},
    addEventListener() {},
    removeEventListener() {},
  };
  function next() {
    const u = queue[0];
    if (!u) return void (fake.speaking = false);
    fake.speaking = true;
    setTimeout(() => {
      if (queue[0] !== u) return;
      u.onstart?.({});
      u.onboundary?.({ name: "word", charIndex: 0 });
      setTimeout(() => {
        if (queue[0] !== u) return;
        queue.shift();
        u.onend?.({});
        next();
      }, 120);
    }, 10);
  }
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      Object.assign(this, { text, lang: "", voice: null, rate: 1, pitch: 1, volume: 1 });
    }
  };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
}, VOICES);
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
  if (m.type() === "warning") warnings.push(m.text());
});
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const SESSION = '[data-part="session"]:not([data-ghost])';
const strayText = [];
const shot = async (name, options = {}) => {
  const found = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/^\s*(null|undefined)+\s*$/.test(node.textContent)) hits.push(node.parentElement?.getAttribute("data-part") ?? node.parentElement?.tagName);
    return hits;
  });
  for (const where of found) strayText.push(`${name}: in ${where}`);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`), ...options });
};
const view = () =>
  page.evaluate(async () => {
    const c = await import("/js/study/content.js");
    return { language: c.contentLanguage(), items: c.ITEMS.map((i) => ({ ...i, sentence: c.sentence(i) })), words: { ...c.WORDS }, packs: c.PACKS.map((p) => ({ ...p })) };
  });
const spoken = () => page.evaluate(() => window.__spoken.splice(0));
const pageText = () => page.locator('[data-part="page"]').first().innerText();
const settingsPage = () => page.locator('[data-part="page"]');
const rowValue = async (title) => (await settingsPage().locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${escape(title)}$`) }) }).first().locator(".lx-row-value").textContent())?.trim();
// Every navigation through goRouted (fixtures/routed.mjs): a bare goto straight after a tab's own page can make the browser drop the
// router's step back, and the router's count of the history is off from then on (an address on #explore with its record on #today).
const goSettings = async (hash, text) => {
  await goRouted(page, BASE, hash);
  await page.waitForFunction((t) => document.querySelector('[data-part="page"]')?.textContent.includes(t), text);
};
const flagOk = (locator) =>
  locator.evaluate(
    (img) =>
      new Promise((resolve) => {
        const ok = () => resolve(img.naturalWidth > 0 ? img.getAttribute("src") : false);
        if (img.complete) return ok();
        img.addEventListener("load", ok, { once: true });
        img.addEventListener("error", () => resolve(false), { once: true });
        setTimeout(ok, 10_000);
      }),
  );

// ---------- sessions, played by scripts/fixtures/play-session.mjs (each step by its kind, never its words) ----------

// Every step's instruction, as shown: none may name another language than the one learned (the stage below reads them).
const labels = [];
// code: a still of each game the first time it comes, before it's answered (shots/<code>-game-<kind>.png), so the
// screens can be reviewed in the language.
const gameShots = new Set();
async function playThrough(hash, limit = 30, code = null) {
  // A fresh session from Study, each step once the router has it: a second round of the same session went to the address its summary was
  // at, an entry with no state that the router never hears of, and every Back after it landed one entry off (fixtures/routed.mjs).
  await goRouted(page, BASE, "#study");
  await goRouted(page, BASE, hash);
  await page.waitForSelector('[data-part="session"]');
  const steps = [];
  for (let i = 0; i < limit; i++) {
    const { kind } = await nextStep(page, { session: SESSION });
    if (kind === "summary") break;
    labels.push(await stepTitle(page, SESSION));
    if (code && !gameShots.has(`${code}/${kind}`)) {
      gameShots.add(`${code}/${kind}`);
      await shot(`${code}-game-${kind}`);
    }
    const step = await answerStep(page, { session: SESSION });
    steps.push({ kind: step.kind, item: step.item?.id });
  }
  assert((await nextStep(page, { session: SESSION }).catch(() => null))?.kind === "summary", `${hash}: the session should end in a summary`);
  return steps;
}

// ---------- the run ----------

const originalCatalogue = await libraryGet("catalogue.json");
const startCatalogue = await must("library_get");
const startRev = startCatalogue.rev;
// A starter is starter-<code>, lowercase as a pack id is (zh-Hant's is starter-zh-hant).
const starterOf = (code) => `starter-${code.toLowerCase()}`;
const files = Object.fromEntries(LANGS.map((code) => [code, join(PACKS, `${starterOf(code)}.json`)]));
const packs = Object.fromEntries(LANGS.map((code) => [code, JSON.parse(readFileSync(files[code], "utf8"))]));
// What the catalog and Explore's index held of each starter at the start: none on a fresh state, but a state seeded with
// the live library already lists some (ja), and the end must match what was found either way.
const entryOf = (catalogue, code) => (catalogue.packs?.[code] ?? []).find((p) => p.id === packs[code].id) ?? null;
const startEntries = Object.fromEntries(LANGS.map((code) => [code, entryOf(startCatalogue, code)]));
const indexedIds = () => sql(`SELECT id FROM items WHERE curated = 1 AND state = 'live' AND id IN (${LANGS.map((code) => q(packs[code].id)).join(", ")})`).map((r) => r.id).sort();
const startIndexed = indexedIds();

for (const code of LANGS) {
  const name = LANGUAGES[code].name;
  await stage(`${name}: its starter passes library_check and is published as a default pack`, async () => {
    const pack = packs[code];
    assert(pack.id === starterOf(code) && pack.language === code, `${pack.id} / ${pack.language}`);
    const { errors, warnings } = checkPack(pack);
    assert(!errors.length && !warnings.length, JSON.stringify({ errors, warnings }).slice(0, 400));
    const sha = await stageFile(files[code], `${starterOf(code)}.json`);
    const checked = await must("library_check", { pack: sha });
    const rev = (await must("library_get")).rev;
    const published = await must("library_publish", { pack: sha, expected_rev: rev, note: `lang-check: the ${name} starter` });
    const listed = (await must("library_get")).packs?.[code] ?? [];
    const entry = listed.find((p) => p.id === pack.id);
    assert(entry && entry.sentences === pack.items.length, `the catalog's ${code} packs: ${JSON.stringify(listed)}`);
    return `${pack.id}@${entry.version}, ${entry.sentences} sentences (check: ${JSON.stringify(checked).slice(0, 120)}; publish: ${JSON.stringify(published).slice(0, 80)})`;
  });
}

await stage("sign up, land in the app (Dutch, as everyone starts)", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Lang Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  // The account's first sync brings Dutch's default packs down after the app is ready. Wait for it, and for the content to hold every
  // pack it brought: a pack arriving during a language's stages rebuilt the content a game or a card had been opened on (the first
  // language's Arrange opening on a card, its card's item gone from ITEMS).
  const settled = await page.evaluate(async () => {
    const [packs, content] = await Promise.all([import("/js/study/packs.js"), import("/js/study/content.js")]);
    await packs.syncLibraryPacks();
    const missing = () => packs.libraryPacks().filter((p) => p.language === content.contentLanguage() && !content.PACKS.some((q) => q.id === p.id)).map((p) => p.id);
    const until = Date.now() + 30_000;
    while (missing().length && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    return { library: packs.libraryPacks().length, missing: missing(), downloading: packs.packDownloads() };
  });
  assert(!settled.missing.length && !settled.downloading, `the first sync never settled: ${JSON.stringify(settled)}`);
  const v = await view();
  assert(v.language === "nl", v.language);
  return `learning ${v.language}, ${v.items.length} sentences from ${settled.library} library packs`;
});

for (const code of LANGS) {
  const lang = LANGUAGES[code];
  const name = lang.name;
  const pack = packs[code];
  const starter = `Starter: ${name}`;

  await stage(`${name}: in Explore under its language, with its flag; added from its page`, async () => {
    await goRouted(page, BASE, `#explore?lang=${code}`);
    await page.waitForFunction((t) => document.querySelector('[data-part="page"]')?.textContent.includes(t), starter, { timeout: 15_000 });
    // Its row in the sheet of languages (from Explore's foot), with its flag. A language with no flag of its own (Esperanto) shows its
    // name alone: no flag at all, never an empty one.
    await page.locator('[data-part="list-row"]', { hasText: /^Change target language/ }).click();
    const choice = page.locator('[data-part="sheet"]').last().locator('[data-part="list-row"]', { hasText: name }).first();
    await choice.waitFor({ timeout: 10_000 });
    const flags = choice.locator('[data-part="language-flag"]');
    const flag = flagOf(code) === null ? ((await flags.count()) ? "a flag" : null) : await flagOk(flags.first());
    assert(flag === flagOf(code), `the ${name} row's flag: ${flag} (want ${flagOf(code)})`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await shot(`${code}-01-explore`, { fullPage: true });
    await page.locator('[data-part="page"]').getByText(starter, { exact: true }).first().click();
    await page.waitForFunction(() => location.hash.startsWith("#explore/item/"));
    await page.locator('[data-part="page-title"]', { hasText: starter }).waitFor();
    const body = await pageText();
    assert(body.includes(name) && body.includes(`${pack.items.length} sentences`), `the item's page: ${body.slice(0, 300)}`);
    await shot(`${code}-02-explore-item`);
    await page.getByRole("button", { name: /^Add pack$/ }).click();
    await page.getByRole("button", { name: /^Added$/ }).waitFor();
    const here = await page.evaluate(async () => (await import("/js/study/packs.js")).libraryPacks().map((p) => (p.pack ?? p).id));
    assert(here.includes(pack.id), `on this device: ${here}`);
    return `listed, flag ${flag}, added (on the device: ${here.join(", ")})`;
  });

  await stage(`${name}: picked in Settings → Language, studying draws on its starter alone`, async () => {
    await goSettings("#settings/language", "Add a language");
    const options = await settingsPage().locator('input[name="learning"]').evaluateAll((nodes) => nodes.map((n) => n.value));
    assert(options.includes(code), `the languages offered: ${options}`);
    await shot(`${code}-03-language-page`);
    await settingsPage().locator(`input[name="learning"][value="${code}"]`).locator("xpath=ancestor::label").click();
    let v;
    for (let i = 0; i < 50; i++) {
      v = await view();
      if (v.language === code && v.items.length === pack.items.length) break;
      await page.waitForTimeout(100);
    }
    assert(v.language === code, `the language is ${v.language}`);
    assert(v.items.length === pack.items.length && v.items.every((i) => i.pack === pack.id), `${v.items.length} items from ${[...new Set(v.items.map((i) => i.pack))]}`);
    await goSettings("#settings", "Language");
    assert((await rowValue("Language")) === name, `the menu's Language row: ${await rowValue("Language")}`);
    return `${options.join(", ")} offered; ${code} picked; ${v.items.length} sentences from ${pack.id}`;
  });

  await stage(`${name}: every screen names it (Study, Read, Explore)`, async () => {
    // From the last language's session summary: Home is reached once the router has stepped back through the history.
    await goRouted(page, BASE, "#today");
    await page.locator('[data-part="tab"]', { hasText: "Study" }).first().click();
    await page.waitForSelector('[data-part="study-door"]');
    await page.locator('[data-part="list-row"]', { hasText: "Your packs" }).click();
    await page.waitForFunction(() => location.hash.startsWith("#study/packs"));
    // Your packs names it: its starter among them, and the game tiles (on Study), which are plan.js's GAMES
    // in order (read in the page, so the names are the ones the app gives this language), each opening its session.
    // The page's list comes in after its address does: read it once its starter's row is there (10 s at most; if it never comes, the rows
    // it does have are what fails).
    await page.locator('[data-part="list-row"] .lx-row-title', { hasText: pack.name }).first().waitFor({ timeout: 10_000 }).catch(() => {});
    const rows = await page.locator('[data-part="list-row"] .lx-row-title').allTextContents();
    const study = await pageText();
    assert(rows.includes(pack.name), `the packs: ${rows.join(" | ")}`);
    assert(study.includes("Find packs in Explore"), `the way to more packs isn't there in ${name}`);
    // The games are buttons on Study's own page (study/quick-play.js), in its order; one that can't play here has no session to open.
    await page.locator('[data-part="app-back"]').first().click();
    await page.waitForFunction(() => location.hash === "#study");
    await page.waitForSelector('[data-part="page"] [data-part="way-tile"]');
    const games = await page.evaluate(async () => {
      const { GAMES } = await import("/js/study/plan.js");
      const { QUICK_GAMES, byMode } = await import("/js/study/game-modes.js");
      // In their sections (Tapping, Typing, Speaking: study/game-modes.js), Study cards last of Tapping.
      return byMode([...QUICK_GAMES, "card"])
        .flatMap((mode) => mode.kinds)
        .map((kind) => (kind === "card" ? { text: "Study cards", href: "#study/session/cards" } : { text: GAMES[kind].name, href: `#study/session/game/${kind}` }));
    });
    const tiles = await page.locator('[data-part="page"] [data-part="way-tile"]').evaluateAll((nodes) => nodes.map((n) => ({ text: n.textContent.trim(), href: n.getAttribute("href"), off: n.dataset.state === "unavailable" })));
    assert(JSON.stringify(tiles.map((t) => t.text)) === JSON.stringify(games.map((g) => g.text)), `the game buttons ${JSON.stringify(tiles)} ≠ GAMES ${JSON.stringify(games)}`);
    assert(tiles.every((t, i) => (t.off ? t.href === null : t.href === games[i].href)), `where they go: ${JSON.stringify(tiles)}`);
    assert(tiles.some((t) => t.text === `Put it in ${name} order`), `no tile names ${name}: ${tiles.map((t) => t.text).join(" | ")}`);
    await shot(`${code}-04-study`, { fullPage: true });
    const known = await knowWords(page);
    assert(known > 0, `no ${name} words were there to know`);
    await page.locator('[data-part="way-tile"]', { hasText: `Put it in ${name} order` }).click();
    await page.waitForFunction(() => location.hash.startsWith("#study/session/game/arrange"), null, { timeout: 10_000 });
    await page.waitForSelector(`${SESSION} [data-part="activity-prompt"]`, { timeout: 15_000 });
    const opened = await nextStep(page, { session: SESSION });
    assert(opened.kind === "arrange", `the Arrange tile opened "${await stepTitle(page, SESSION)}" (${opened.kind})`);
    const named = {};
    for (const [hash, needle] of [
      // (With nothing on this server's shelf at all it says so plainly; with books for other languages it names this one: reader-check.)
      ["#read", [`woven into ${name}.`, `No books in ${name} yet.`, "No open books yet."]],
      [`#explore`, name],
    ]) {
      await goRouted(page, BASE, hash);
      await page.waitForFunction((ts) => [].concat(ts).some((t) => document.querySelector('[data-part="page"]')?.innerText.includes(t)), needle, { timeout: 15_000 });
      named[hash] = needle;
      await shot(`${code}-05-${hash.slice(1)}`);
    }
    // Explore's sheet of languages has this one first, as the one being learned.
    await goRouted(page, BASE, "#explore");
    await page.locator('[data-part="list-row"]', { hasText: /^Change target language/ }).click();
    const chosen = await page.locator('[data-part="sheet"]').last().locator('[data-part="list-row"]').first().textContent();
    assert(chosen.includes(name) && chosen.includes("Learning"), `Explore's language, first: ${chosen}`);
    await page.keyboard.press("Escape");
    return `${tiles.length} game tiles as GAMES, Arrange's opening its session; ${JSON.stringify(named)}`;
  });

  await stage(`${name}: a card reads in it, and the device voice is asked for ${voiceTag(code)}`, async () => {
    await spoken();
    await goRouted(page, BASE, "#study/session/cards");
    await page.waitForSelector(`${SESSION} [data-part="target-line"]`);
    const card = await page.evaluate(() => {
      const s = document.querySelector('[data-part="session"]:not([data-ghost])');
      return { prompt: s.querySelector('[data-part="activity-prompt"] > span')?.textContent, lang: s.querySelector('[data-part="target-line"]').getAttribute("lang"), item: s.getAttribute("data-item") };
    });
    assert(card.prompt === `Read it in ${name}` && card.lang === code, JSON.stringify(card));
    await page.locator(`${SESSION}`).getByRole("button", { name: "Play the sentence" }).first().click();
    let said = [];
    for (let i = 0; i < 30 && !said.length; i++) {
      said = await spoken();
      if (!said.length) await page.waitForTimeout(100);
    }
    const item = (await view()).items.find((i) => i.id === card.item);
    assert(said.length && said.every((s) => s.lang === voiceTag(code) && s.voice === `Fake ${name}`), `spoken: ${JSON.stringify(said)}`);
    assert(said.some((s) => s.text === item.sentence), `spoken: ${JSON.stringify(said)}; the card: ${item.sentence}`);
    await shot(`${code}-06-card`);
    return `"${card.prompt}", lang ${card.lang}; asked to say "${said[0].text}" in ${said[0].lang} (${said[0].voice})`;
  });

  await stage(`${name}: the quick session and every game play through, each step answered, the evidence in ${code}`, async () => {
    const before = (await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence())).length;
    labels.length = 0;
    const steps = [];
    for (let round = 0; round < 2; round++) steps.push(...(await playThrough("#study/session/quick", 30, code)));
    for (const kind of ["choose", "arrange", "place", "fill", "type", "match", "listen", "say", "repeat", "cards"]) {
      const hash = kind === "cards" ? "#study/session/cards" : `#study/session/game/${kind}`;
      steps.push(...(await playThrough(hash, 30, code)));
    }
    await shot(`${code}-07-summary`);
    const rows = (await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence())).slice(before);
    assert(rows.length && rows.every((r) => r.lang === code), `${rows.length} rows, langs ${[...new Set(rows.map((r) => r.lang))]}`);
    const strays = steps.filter((s) => s.item && !s.item.startsWith(`${pack.id}/`));
    assert(!strays.length, `steps from another pack: ${JSON.stringify(strays.slice(0, 3))}`);
    const prompts = [...new Set(labels)];
    // Every language's name, the longest first, so "Chinese (Traditional)" is read whole, never as "Chinese".
    const names = Object.entries(LANGUAGES).filter(([other]) => other !== "en").map(([, l]) => l.name).sort((a, b) => b.length - a.length);
    const naming = new RegExp(`(?<!\\p{L})(?:${names.map(escape).join("|")})(?!\\p{L})`, "gu");
    const otherLanguage = prompts.filter((l) => [...l.matchAll(naming)].some(([named]) => named !== name));
    assert(!otherLanguage.length, `prompts naming another language: ${otherLanguage}`);
    const said = await spoken();
    assert(said.every((s) => s.lang === voiceTag(code) || s.lang === "en-US"), `spoken in: ${[...new Set(said.map((s) => s.lang))]}`);
    return `${steps.length} steps (${[...new Set(steps.map((s) => s.kind))].join(", ")}); ${rows.length} evidence rows, all ${code}; prompts: ${prompts.join(" | ")}; ${said.length} things spoken, in ${[...new Set(said.map((s) => s.lang))].join(", ")}`;
  });
}

// ---------- putting things back ----------

await stage("the learner deletes their account in Settings", async () => {
  await goRouted(page, BASE, "#settings/account");
  await page.waitForSelector('[data-part="list-row"]');
  await page.locator('[data-part="list-row"]', { hasText: "Delete my account" }).click();
  await page.locator('[data-part="list-row"]', { hasText: "Press again to delete it for good" }).click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  return "deleted";
});

await stage("the catalog is back as it was found (library_restore), and so is Explore's index", async () => {
  const history = await must("library_history");
  const revisions = history.revisions ?? history;
  const found = Array.isArray(revisions) ? revisions.find((r) => r.rev === startRev) : null;
  let how;
  // A run that published only what was there already (a seeded state's ja) left the catalog at the revision found.
  if ((await must("library_get")).rev === startRev) {
    how = `unchanged at revision ${startRev} (each starter published was the version already listed)`;
  } else if (found && originalCatalogue !== null) {
    // A revision to go back to, and a catalog file to go back to (an earlier run on this state may have removed the
    // file while its revisions stay in D1: then restoring one would write a file that wasn't there).
    await must("library_restore", { rev: startRev });
    how = `restored to revision ${startRev}`;
  } else {
    // No revision to go back to (a fresh state, or a catalog written outside the admin tools): take off, through the
    // tools so Explore's index follows, the starters the run added, then put the catalog's file back exactly as found.
    for (const code of LANGS) if (!startEntries[code]) await must("library_unpublish", { pack: packs[code].id, lang: code });
    if (originalCatalogue === null) await r2.remove("lexicommons-library", "catalogue.json");
    else {
      await libraryPut("catalogue.json", originalCatalogue);
    }
    how = originalCatalogue === null ? "unpublished, and the catalog's file removed again (there was none)" : "unpublished, and the catalog's file put back";
  }
  const after = await must("library_get");
  for (const code of LANGS) {
    const [now, then] = [entryOf(after, code), startEntries[code]];
    assert(JSON.stringify(now) === JSON.stringify(then), `${code}: ${now ? `listed as ${now.version}` : "not listed"} at the end, ${then ? `listed as ${then.version}` : "not listed"} at the start`);
  }
  const text = await libraryGet("catalogue.json");
  // Every write stamps a new writeId (the catalog's compare-and-set token), so a restored catalog matches in everything else.
  const content = (raw) => JSON.stringify({ ...JSON.parse(raw), writeId: undefined });
  const same = originalCatalogue === null ? text === null : text !== null && content(text) === content(originalCatalogue);
  assert(same, "the catalog differs from the one found");
  const indexed = indexedIds();
  assert(JSON.stringify(indexed) === JSON.stringify(startIndexed), `in Explore at the end: ${indexed.join(", ") || "none"}; at the start: ${startIndexed.join(", ") || "none"}`);
  return `${how}; the catalog's content as found; in Explore as found (${startIndexed.join(", ") || "none of them"})`;
});

await stage("the admin written for this check is gone from D1", async () => {
  sql(`DELETE FROM api_tokens WHERE user_id = ${q(ADMIN.id)}; DELETE FROM user_roles WHERE user_id = ${q(ADMIN.id)}; DELETE FROM users WHERE id = ${q(ADMIN.id)}`);
  assert(!sql(`SELECT id FROM users WHERE id = ${q(ADMIN.id)}`).length, "still there");
  return ADMIN.id;
});

await stage('no stray "null" or "undefined" text on any screen shot', async () => {
  assert(!strayText.length, `stray text: ${strayText.slice(0, 5).join(" · ")}`);
  return "none";
});

await stage("no console errors", async () => {
  const real = problems.filter((p) => !/status of 401/.test(p));
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
rmSync(scratch, { recursive: true, force: true });
writeFileSync(join(OUT, "lang-check.json"), JSON.stringify({ base: BASE, langs: LANGS, at: new Date().toISOString(), results, problems, warnings }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
