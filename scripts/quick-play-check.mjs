// Study's quick play (study/quick-play.js), in Chrome on a phone, from an account that knows its words: every game a large button on Study's own page in
// its section by how it's answered (Tapping, Typing, Speaking: study/game-modes.js, plan.js's modes), each a small heading over its own rows,
// three to a row at 390 and 320 wide, dark and light, a line with a hard edge under it, nothing cut off; a press plays a few rounds of only that game to the
// usual end and comes back to Study, and every game's plan is only that game; a game that can't play here (no voice for the language, no recognizer) is there,
// quieter, and a press says why and where to change it, starting nothing; Choose the games is a drawer with no page arrow; More ways keeps what isn't a game
// and no game twice; no word of an AI. LOCAL only, path-nl seeded (scripts/packs/seed-local.mjs --default). A recording of one press played through: walk.mp4.
// Usage: node scripts/quick-play-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { pastReminderAsk } from "./fixtures/play-session.mjs";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const ONLY = opt("only") && new RegExp(opt("only"));
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/quick-play-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 10).join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (got, want, what) => assert(JSON.stringify(got) === JSON.stringify(want), `${what}\n got  ${JSON.stringify(got)?.slice(0, 500)}\n want ${JSON.stringify(want)?.slice(0, 500)}`);
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
const run = randomBytes(3).toString("hex");
function account(name) {
  const id = `qp${run}${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql([
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'quick-play-check')`,
  ].join("; "));
  return { id, name, cookie };
}

const PAGE = '[data-part="page"]';
const SESSION = '[data-part="session"]:not([data-ghost])';
const TILE = `${PAGE} [data-part="way-tile"]`;
const browser = await chromium.launch();
/** A phone of a new account that knows its words. theme: graphite (dark) or paper (light). noVoice: no voice for Dutch and its recordings unreachable. noRecognizer: none. */
async function phone({ width = 390, height = 844, theme = "graphite", noVoice = false, noRecognizer = false, video } = {}) {
  const who = account(`Quick Play ${run} ${theme} ${width}`);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, ...(video ? { recordVideo: { dir: video, size: { width, height } } } : {}) });
  await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
  await context.addInitScript(
    ({ theme, noVoice, noRecognizer }) => {
      try {
        if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme, presets: {} }));
      } catch {}
      if (noVoice) window.speechSynthesis.getVoices = () => [];
      if (noRecognizer) {
        Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true, writable: true });
        Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true, writable: true });
      }
    },
    { theme, noVoice, noRecognizer },
  );
  if (noVoice) await context.route("**/audio/**/manifest.json", (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.waitForFunction(() => document.documentElement.dataset.theme);
  await knowWords(page);
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForSelector(TILE, { timeout: 20_000 });
  await page.waitForFunction((T) => [...document.querySelectorAll(T)].every((t) => t.querySelector(".lx-way-art > svg")), TILE, { timeout: 15_000 });
  return { context, page, errors };
}
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const NO_AI = /\b(AI|A\.I\.|Claude|ChatGPT|assistant|Codex)\b/;
const shot = async (page, name, options = {}) => {
  await settle(page, 700);
  await page.screenshot({ path: join(OUT, `${name}.png`), ...options });
};

// What a game's tile should say, in quick play's order within its section (Tapping, Typing, Speaking: study/game-modes.js), Study cards last of Tapping.
const expected = (page) =>
  page.evaluate(async () => {
    const { GAMES } = await import("/js/study/plan.js");
    const { QUICK_GAMES, byMode } = await import("/js/study/game-modes.js");
    return byMode([...QUICK_GAMES, "card"])
      .flatMap((mode) => mode.kinds)
      .map((kind) => (kind === "card" ? { kind: "card", name: "Study cards" } : { kind, name: GAMES[kind].name }));
  });

await stage("every game a large button on Study, three to a row, at 390 and 320 wide in dark and light: a line with a hard edge, nothing cut off or off the page, under the doors", async () => {
  const seen = [];
  const measures = [];
  for (const [theme, width, height] of [["graphite", 390, 844], ["paper", 390, 844], ["graphite", 320, 568], ["paper", 320, 568]]) {
    const { context, page, errors } = await phone({ theme, width, height });
    try {
      const games = await expected(page);
      // Every game, section by section: one added or gone is named here on purpose (a count of 14 outlived the typing games unseen).
      eq(games.map((game) => game.kind), ["see", "word", "match", "meaning", "fill", "choose", "place", "arrange", "translate", "listen", "card", "type", "type-word", "type-gap", "hear-gap", "repeat", "say", "say-word", "repeat-word"], "the games there are, Tapping, Typing, Speaking (Study cards among them)");
      const m = await page.evaluate((T) => {
        const tiles = [...document.querySelectorAll(T)];
        const boxes = tiles.map((t) => t.getBoundingClientRect());
        const name = (t) => t.querySelector(".lx-way-name");
        const door = document.querySelector('[data-part="page"] [data-part="study-door"]')?.getBoundingClientRect();
        // What comes just before the games: nothing empty between, only the page's own space.
        const section = document.querySelector(".lx-quick-play");
        const before = section?.previousElementSibling?.getBoundingClientRect();
        return {
          names: tiles.map((t) => t.textContent.trim()),
          games: tiles.map((t) => t.dataset.game),
          columns: [...new Set(boxes.map((b) => Math.round(b.left)))].length,
          rows: [...new Set(boxes.map((b) => Math.round(b.top)))].length,
          small: boxes.filter((b) => b.width < 44 || b.height < 44).length,
          cut: tiles.filter((t) => name(t).scrollHeight > name(t).clientHeight + 1 || name(t).scrollWidth > name(t).clientWidth + 1).map((t) => t.textContent.trim()),
          off: boxes.filter((b) => b.left < 0 || b.right > innerWidth + 0.5).length,
          sideways: document.documentElement.scrollWidth - innerWidth,
          edge: tiles.map((t) => getComputedStyle(t).boxShadow).filter((s) => !/\d+px 0px/.test(s) && !/0px \dpx 0px/.test(s)).length,
          fill: tiles.filter((t) => !t.dataset.state && getComputedStyle(t).backgroundColor === "rgba(0, 0, 0, 0)").length,
          art: tiles.filter((t) => t.querySelector(".lx-way-art > svg")?.dataset.game !== t.dataset.game).length,
          below: door ? boxes.every((b) => b.top > door.bottom) : null,
          gap: before ? Math.round(section.getBoundingClientRect().top - before.bottom) : null,
          emptyLists: [...document.querySelectorAll('[data-part="page"] ul[part="list"], [data-part="page"] [data-part="list"]')].filter((list) => list.checkVisibility() && !list.children.length).length,
          text: Math.min(...tiles.map((t) => parseFloat(getComputedStyle(name(t)).fontSize))),
          // Each name whole inside its own button: never past its edge.
          spill: tiles.filter((t) => name(t).getBoundingClientRect().bottom > t.getBoundingClientRect().bottom - 2 || name(t).getBoundingClientRect().right > t.getBoundingClientRect().right).map((t) => t.textContent.trim()),
        };
      }, TILE);
      eq(m.names, games.map((g) => g.name), `${theme} ${width}: the buttons`);
      eq(m.games, games.map((g) => g.kind), `${theme} ${width}: which game each is`);
      // Three to a row in each section (Tapping, Typing, Speaking: study/game-modes.js), each starting its own row.
      const rows = await page.evaluate(async () => {
        const { QUICK_GAMES, byMode } = await import("/js/study/game-modes.js");
        return byMode([...QUICK_GAMES, "card"]).reduce((sum, mode) => sum + Math.ceil(mode.kinds.length / 3), 0);
      });
      eq([m.columns, m.rows], [3, rows], `${theme} ${width}: three to a row, a section's own rows`);
      eq([m.small, m.off, m.sideways, m.fill, m.art], [0, 0, 0, 0, 0], `${theme} ${width}: under 44 px, off the page, sideways, not filled, without its own game symbol`);
      eq(m.cut, [], `${theme} ${width}: a name cut off`);
      eq(m.spill, [], `${theme} ${width}: a name past its button's edge`);
      // With nothing scrolled, a whole row of games above the bar: the bottom half of the screen is the games.
      const first = await page.evaluate((T) => {
        for (const one of [document.querySelector('[data-part="page"]'), document.scrollingElement]) if (one) one.scrollTop = 0;
        const tiles = [...document.querySelectorAll(T)].slice(0, 3).map((t) => t.getBoundingClientRect());
        const bar = document.querySelector('[data-part="tab-bar"]')?.getBoundingClientRect();
        const host = document.querySelector(".lx-quick-play")?.parentElement;
        const blocks = [...(host?.children ?? [])].map((one) => `${one.className || one.getAttribute("data-part") || one.tagName}:${Math.round(one.getBoundingClientRect().top)}-${Math.round(one.getBoundingClientRect().bottom)}`);
        return { rowBottom: Math.round(Math.max(...tiles.map((b) => b.bottom)) + 5), rowTop: Math.round(tiles[0].top), barTop: Math.round(bar?.top ?? innerHeight), blocks };
      }, TILE);
      assert(first.rowBottom <= first.barTop, `${theme} ${width}×${height}: the first row of games isn't whole above the bar (${JSON.stringify(first)})`);
      measures.push({ at: `${theme} ${width}×${height}`, ...first });
      assert(m.edge === 0, `${theme} ${width}: ${m.edge} buttons without a hard edge`);
      assert(m.below === true, `${theme} ${width}: the games sit above the doors`);
      assert(m.gap !== null && m.gap <= 40, `${theme} ${width}: ${m.gap} px of nothing above the games`);
      eq(m.emptyLists, 0, `${theme} ${width}: an empty list on the page`);
      assert(m.text >= 12, `${theme} ${width}: names at ${m.text} px`);
      const text = await page.locator(PAGE).first().innerText();
      assert(!NO_AI.test(text), `${theme} ${width}: Study mentions an AI`);
      // As it opens, then every row of the games in clear view (a tall window, so the bar covers none of them).
      await shot(page, `study-${theme}-${width}`);
      await page.setViewportSize({ width, height: 1600 });
      await settle(page, 500);
      const box = await page.locator(".lx-quick-play").boundingBox();
      await page.screenshot({ path: join(OUT, `grid-${theme}-${width}.png`), clip: { x: 0, y: Math.max(0, box.y - 8), width, height: box.height + 16 } });
      assert(!errors.length, `page errors: ${errors.slice(0, 3)}`);
      seen.push(`${theme} ${width}`);
    } finally {
      await context.close();
    }
  }
  return measures;
});
await stage("every game's few rounds are that game alone, from what's due and what you know: six questions, Match three rounds", async () => {
  const { context, page } = await phone();
  try {
    const plans = await page.evaluate(async () => {
      const { planSession } = await import("/js/study/plan.js");
      const { QUICK_GAMES } = await import("/js/study/quick-play.js");
      return QUICK_GAMES.map((kind) => {
        const plan = planSession("game", kind);
        return { kind, steps: plan.steps.map((step) => step.kind), note: plan.note ?? null };
      });
    });
    const wrong = plans.filter((plan) => !plan.steps.length || plan.steps.some((kind) => kind !== plan.kind) || (plan.kind === "match" ? plan.steps.length > 3 : plan.steps.length > 6));
    eq(wrong, [], "a plan that isn't only its game, or is longer than a few rounds");
    return plans.map((plan) => `${plan.kind} ${plan.steps.length}`).join(", ");
  } finally {
    await context.close();
  }
});

// Answers the step on screen: right, as a learner would. Only the games of a press played through here.
async function answer(page) {
  const step = await page.evaluate((S) => {
    const s = document.querySelector(S)?.lxStep;
    return s ? { kind: s.kind, nl: s.item?.nl?.map(([t]) => t) ?? s.nl, punct: s.item?.punct ?? s.punct ?? "", gapIndex: s.item?.gap?.index ?? s.gapIndex, target: s.target, answers: s.answers } : null;
  }, SESSION);
  const session = page.locator(SESSION);
  const bar = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`);
  if (!step) return null;
  if (step.kind === "match") {
    for (const nl of await session.locator('[data-part="match-item"][data-side="nl"]').allTextContents()) {
      await session.locator('[data-part="match-item"][data-side="nl"]', { hasText: nl }).first().click();
      await session.locator('[data-part="match-item"][data-side="en"]', { hasText: step.answers[nl] }).first().click();
      await settle(page, 250);
    }
  } else await session.getByRole("button", { name: "I don't know" }).click();
  await settle(page, 400);
  if (await bar.count()) await bar.click();
  return step.kind;
}

await stage("a press plays a few rounds of only that game to the usual end, and comes back to Study (recorded)", async () => {
  const video = join(OUT, "walk-raw");
  rmSync(video, { recursive: true, force: true });
  const { context, page, errors } = await phone({ video });
  const kinds = [];
  try {
    await page.locator(TILE, { hasText: "Match" }).scrollIntoViewIfNeeded();
    await settle(page, 900);
    await page.locator(TILE, { hasText: "Match" }).click();
    await page.waitForFunction(() => location.hash.startsWith("#study/session/game/match"), null, { timeout: 10_000 });
    await page.waitForSelector(SESSION, { timeout: 15_000 });
    for (let i = 0; i < 12; i++) {
      if (await page.locator(`${SESSION} [data-part="session-summary"]`).count()) break;
      await settle(page, 300);
      const kind = await answer(page);
      if (kind) kinds.push(kind);
    }
    await page.locator(`${SESSION} [data-part="session-summary"]`).waitFor({ timeout: 15_000 });
    await settle(page, 1500);
    assert(kinds.length >= 1 && kinds.every((kind) => kind === "match"), `what it asked: ${kinds}`);
    await page.locator(SESSION).getByRole("button", { name: "Done", exact: true }).click();
    await pastReminderAsk(page, { session: SESSION });
    await page.waitForFunction(() => !document.querySelector('[data-part="session"]') && location.hash === "#study", null, { timeout: 15_000 });
    await settle(page, 1200);
    assert(!errors.length, `page errors: ${errors.slice(0, 3)}`);
  } finally {
    await context.close();
  }
  const [file] = readdirSync(video);
  renameSync(join(video, file), join(OUT, "walk.webm"));
  rmSync(video, { recursive: true, force: true });
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(OUT, "walk.webm"), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", join(OUT, "walk.mp4")]);
  rmSync(join(OUT, "walk.webm"), { force: true });
  return `${kinds.length} rounds of Match, then Study`;
});

await stage("a game that can't play here is there, quieter, and a press says why and where to change it, starting nothing: no voice, then no recognizer", async () => {
  const said = [];
  {
    const { context, page } = await phone({ noVoice: true });
    try {
      const off = await page.locator(`${TILE}[data-state="unavailable"]`).evaluateAll((nodes) => nodes.map((n) => n.dataset.game));
      for (const kind of ["listen", "repeat"]) assert(off.includes(kind), `with no voice, ${kind} is playable: ${off}`);
      assert(await page.locator(`${TILE}[data-game="listen"] .lx-way-art[data-art="theme"]`).count(), "a game that can't play keeps its colors");
      assert(!off.includes("match") && !off.includes("fill"), `with no voice, a game that needs none is off: ${off}`);
      await page.locator(TILE, { hasText: "Listening" }).click();
      const sheet = page.locator('[data-part="sheet"]:not([hidden])', { hasText: "can't play here" });
      await sheet.waitFor({ timeout: 5000 });
      said.push((await sheet.innerText()).split("\n").filter(Boolean).slice(0, 2).join(" "));
      assert(/no Dutch voice/.test(said[0]), `why: ${said[0]}`);
      assert(!(await page.evaluate(() => location.hash)).startsWith("#study/session"), "it started a session");
      await shot(page, "no-voice-why");
      await sheet.locator('[data-part="list-row"]', { hasText: "Voices" }).click();
      await page.waitForFunction(() => location.hash === "#settings/study/voices", null, { timeout: 10_000 });
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await phone({ noRecognizer: true });
    try {
      await page.waitForSelector(`${TILE}[data-game="say"][data-state="unavailable"]`, { timeout: 15_000 });
      await page.locator(`${TILE}[data-game="say"]`).click();
      const sheet = page.locator('[data-part="sheet"]:not([hidden])', { hasText: "can't play here" });
      await sheet.waitFor({ timeout: 5000 });
      said.push((await sheet.innerText()).split("\n").filter(Boolean).slice(0, 2).join(" "));
      assert(await sheet.locator('[data-part="list-row"]', { hasText: "Speaking" }).count(), "no way to Speaking");
      assert(!(await page.evaluate(() => location.hash)).startsWith("#study/session"), "it started a session");
      assert(await page.locator(`${TILE}[data-game="listen"]:not([data-state])`).count(), "with a voice, Listening is off for want of a recognizer");
      await shot(page, "no-recognizer-why");
    } finally {
      await context.close();
    }
  }
  return said;
});

await stage("Choose the games is a drawer with no page arrow; Study cards is a game there too, and More ways is gone", async () => {
  const { context, page } = await phone();
  try {
    const row = page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "Choose the games" });
    // A page's arrow is icons.js's chevron; a drawer's own mark (lex-design-3's opens: "sheet") is something else.
    assert(!(await row.evaluate((r) => [...r.querySelectorAll("path")].some((path) => path.getAttribute("d") === "M9.5 6l6 6-6 6"))), "Choose the games has a page arrow");
    await row.click();
    await page.locator('[data-part="sheet"]:not([hidden])', { hasText: "Choose the games" }).waitFor({ timeout: 5000 });
    assert(!(await page.evaluate(() => location.hash)).startsWith("#study/"), "it went to a page");
    await shot(page, "choose-the-games");
    await page.keyboard.press("Escape");
    eq(await page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "More ways to study" }).count(), 0, "More ways is still on Study");
    const cards = page.locator(`${PAGE} [data-part="way-tile"][data-game="card"]`);
    eq(await cards.count(), 1, "Study cards among the games");
    eq(await cards.getAttribute("href"), "#study/session/cards", "Study cards' tile");
    await page.goto(`${BASE}/app/#study/more`);
    await page.waitForSelector(`${PAGE} [data-part="way-tile"]`, { timeout: 10_000 });
    eq(await page.locator(".lx-study-ways").count(), 0, "the old More ways page");
  } finally {
    await context.close();
  }
});

await stage("every game's own page in Settings → Study and Games opens with its name and its switch, and no error (the typing and speaking games have no hint or word-for-word line)", async () => {
  const { context, page, errors } = await phone();
  try {
    const games = await page.evaluate(async () => {
      const { GAMES } = await import("/js/study/plan.js");
      return Object.entries(GAMES).map(([kind, game]) => ({ kind, name: game.name }));
    });
    const seen = [];
    for (const { kind, name } of games) {
      const before = errors.length;
      await page.evaluate((k) => (location.hash = `#settings/study/${k}`), kind);
      await page.waitForFunction((n) => document.querySelector('[data-part="app-title"]')?.textContent.includes(n), name, { timeout: 10_000 }).catch(() => {});
      await settle(page, 300);
      assert(errors.length === before, `${kind}: ${errors.slice(before).join(" | ")}`);
      assert((await page.locator(PAGE).innerText()).includes("Use in your day and quick sessions"), `${kind}: no "Use in your day" switch`);
      seen.push(kind);
    }
    return `${seen.length} games: ${seen.join(", ")}`;
  } finally {
    await context.close();
  }
});

await browser.close().catch(() => {});
writeFileSync(join(OUT, "quick-play-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((one) => !one.ok).length;
console.log(`quick play check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
