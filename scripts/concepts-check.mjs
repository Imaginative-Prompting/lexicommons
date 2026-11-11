// Choose your concepts (study/concept-focus.js), in Chrome on a phone, from an account that knows its words and has met some concepts: the drawer lists them
// after All concepts (chosen while none is picked), with how many sentences use each, one with too few (a small pack of its own plants one, whatever the
// server has) can't be picked and says why; a picked one bold with a check; Practice's own line says what's picked, with nothing above the doors moving, and the
// row names it; Practice, reviews, a quick session and every game then keep to its sentences and their words, a lesson doesn't change, and it lasts a reload;
// All concepts puts it all back; nothing to ask says so; Practice's line at 390 and 320 in dark and light, and a recording (walk.mp4). LOCAL only, path-nl seeded (scripts/packs/seed-local.mjs --default).
// Usage: node scripts/concepts-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { knowWords, untilSaved } from "./fixtures/know-words.mjs";
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
  console.error("Usage: node scripts/concepts-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>] (a local server only)");
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
  const id = `cf${run}${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql([
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'concepts-check')`,
  ].join("; "));
  return { id, name, cookie };
}

const PAGE = '[data-part="page"]';
const SESSION = '[data-part="session"]:not([data-ghost])';
const TILE = `${PAGE} [data-part="way-tile"]`;
const browser = await chromium.launch();
/** A phone of a new account that knows its words. theme: graphite (dark) or paper (light). noVoice: no voice for Dutch and its recordings unreachable. noRecognizer: none. */
async function phone({ width = 390, height = 844, theme = "graphite", noVoice = false, noRecognizer = false, video } = {}) {
  const who = account(`Concepts ${run} ${theme} ${width}`);
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
const shot = async (page, name) => {
  await settle(page, 700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};
const sheet = (page) => page.locator('[data-part="sheet"]:not([hidden])').first();
// What's picked is said in Practice's own line (shell/study.js), never in a line of its own above the doors.
const SUB = `${PAGE} [data-part="study-door"][data-door="practice"] .lx-door-sub`;
const subText = async (page) => (await page.locator(SUB).innerText()).replace(/\s+/g, " ").trim();
const untilSub = (page, start) => page.waitForFunction(([S, start]) => document.querySelector(S)?.textContent.replace(/\s+/g, " ").trim().startsWith(start), [SUB, start], { timeout: 5000 });
// Where the doors are in the page, not on the screen: pressing a row further down scrolls the page to it.
const doorsTop = (page) =>
  page.locator(`${PAGE} [data-part="study-door"]`).first().evaluate((d) => {
    let s = d.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    const top = d.getBoundingClientRect().top;
    return Math.round(s ? top - s.getBoundingClientRect().top + s.scrollTop : top + scrollY);
  });

// Two concepts met with enough sentences to keep to, and one met with too few, from what's on this device.
async function meetConcepts(page) {
  // The lessons' pack, not only the starter inside the app.
  for (let i = 0; i < 120 && !(await page.evaluate(async () => (await import("/js/study/content.js")).LESSONS.length > 100)); i++) await settle(page, 500);
  // Its words known too, not only the starter's, so Practice can ask its sentences.
  await knowWords(page);
  const { last, ...met } = await page.evaluate(async (least) => {
    const { record } = await import("/js/study/progress.js");
    const { ITEMS, PATTERNS } = await import("/js/study/content.js");
    const counts = Object.keys(PATTERNS).map((id) => ({ id, n: ITEMS.filter((item) => item.concepts?.includes(id)).length }));
    const enough = counts.filter((c) => c.n >= least).sort((a, b) => a.n - b.n);
    const thin = counts.filter((c) => c.n > 0 && c.n < least);
    const chosen = [enough[0], enough[1], thin[0]].filter(Boolean);
    const rows = record(chosen.map((c) => ({ concept: `p:${c.id}`, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "concepts-check" })));
    return { enough: enough.slice(0, 2), thin: thin[0] ?? null, last: rows.at(-1)?.uid ?? null };
  }, 6);
  // Saved on the device before anything reloads (a reload before then loses them).
  await untilSaved(page, last);
  return met;
}
// A concept met with too few sentences to keep to, whatever packs the server has (with Dutch's eleven default packs every shared one has
// 6 or more): a small pack of this account's own, the starter's first two sentences, showing a pattern of its own that nothing else does.
const THIN = { pack: "concepts-thin", pattern: "concepts-thin.check", name: "Too few to keep to", sentences: 2 };
async function plantThin(page) {
  const planted = await page.evaluate(async (THIN) => {
    const { savePack } = await import("/js/study/packs.js");
    const { BUILT_IN } = await import("/js/packs/index.js");
    const { record } = await import("/js/study/progress.js");
    const content = await import("/js/study/content.js");
    const starter = structuredClone(BUILT_IN[0]);
    const items = starter.items.filter((item) => item.words?.length).slice(0, THIN.sentences).map((item) => ({ ...item, concepts: [THIN.pattern] }));
    const saved = await savePack({ ...starter, id: THIN.pack, name: "Concepts check: too few", patterns: { [THIN.pattern]: { name: THIN.name, about: "A check's own pattern, on two sentences." } }, items }, { by: "concepts-check" });
    if (!saved.ok) return { error: JSON.stringify(saved.errors).slice(0, 400) };
    for (let i = 0; i < 100 && !(THIN.pattern in content.PATTERNS); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    const sentences = content.ITEMS.filter((item) => item.concepts?.includes(THIN.pattern)).length;
    const rows = record([{ concept: `p:${THIN.pattern}`, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "concepts-check" }]);
    return { sentences, last: rows.at(-1)?.uid ?? null };
  }, THIN);
  assert(!planted.error, `the pack with too few sentences wasn't saved: ${planted.error}`);
  assert(planted.sentences === THIN.sentences, `the planted concept should have ${THIN.sentences} sentences on the device: ${planted.sentences}`);
  await untilSaved(page, planted.last);
}
// What a session would ask, in the page: each step's sentence's concepts and its words, or its words for a word game.
const planOf = (page, mode, arg) =>
  page.evaluate(
    async ([mode, arg]) => {
      const { planSession } = await import("/js/study/plan.js");
      const plan = planSession(mode, arg);
      return {
        empty: plan.empty ?? null,
        focus: plan.focus ?? null,
        steps: plan.steps.map((step) => ({
          kind: step.kind,
          concepts: step.item?.concepts ?? null,
          item: step.item?.id ?? null,
          words: step.kind === "match" ? Object.keys(step.answers ?? {}) : null,
          unit: step.unit ?? step.target ?? null,
        })),
      };
    },
    [mode, arg],
  );

let met = null;
await stage("the drawer: All concepts first, chosen with none picked; every concept you've met with how many sentences use it; one with too few is there, can't be picked, and says why; picking one makes it bold with a check, leaves All, and Practice's line says so with the doors where they were; the row names it", async () => {
  const { context, page, errors } = await phone();
  try {
    met = await meetConcepts(page);
    assert(met.enough.length === 2, `two concepts with enough sentences: ${JSON.stringify(met)}`);
    await plantThin(page);
    await page.reload();
    await page.waitForSelector(TILE, { timeout: 20_000 });
    assert((await subText(page)).startsWith("What you know, mixed"), `Practice's line with nothing picked: ${await subText(page)}`);
    eq(await page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "Choose your concepts" }).locator(".lx-row-value").innerText(), "All", "the row with nothing picked");
    const topBefore = await doorsTop(page);
    await page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "Choose your concepts" }).click();
    await sheet(page).locator(".lx-sheet-title", { hasText: "Choose your concepts" }).waitFor({ timeout: 5000 });
    const rows = await sheet(page).locator('[data-part="list-row"]').evaluateAll((nodes) => nodes.map((n) => ({ text: n.innerText.replace(/\s+/g, " ").trim(), disabled: Boolean(n.disabled), chosen: n.getAttribute("aria-pressed") === "true" })));
    assert(rows[0]?.text.startsWith("All concepts") && rows[0].chosen && rows.filter((r) => r.chosen).length === 1, `All concepts first and the only one chosen: ${JSON.stringify(rows.slice(0, 3))}`);
    const label = (id) => page.evaluate(async (id) => (await import("/js/study/concept-focus.js")).conceptLabel(id), id);
    const [one, two] = [await label(met.enough[0].id), await label(met.enough[1].id)];
    assert(rows.some((r) => r.text.startsWith(one) && r.text.includes(`${met.enough[0].n} sentences`) && !r.disabled), `${one}: ${JSON.stringify(rows)}`);
    // Too few sentences: there, can't be picked, and says why. The planted one on every server; the server's own as well when it has one.
    const thinLabels = [THIN.name, ...(met.thin ? [await label(met.thin.id)] : [])];
    for (const thinLabel of thinLabels) assert(rows.some((r) => r.text.startsWith(thinLabel) && /so far: it needs 6/.test(r.text) && r.disabled), `${thinLabel} isn't there as one that can't be picked: ${JSON.stringify(rows)}`);
    assert(!NO_AI.test(await sheet(page).innerText()), "the drawer mentions an AI");
    await sheet(page).locator('[data-part="list-row"]', { hasText: one }).first().click();
    const after = await sheet(page).locator('[data-part="list-row"]').evaluateAll((nodes) => nodes.map((n) => ({ text: n.innerText.replace(/\s+/g, " ").trim(), chosen: n.getAttribute("aria-pressed") === "true", bold: Number(getComputedStyle(n.querySelector(".lx-row-title")).fontWeight), check: getComputedStyle(n.querySelector(".lx-choice-check")).visibility })));
    const picked = after.find((r) => r.text.startsWith(one));
    assert(picked?.chosen && picked.bold >= 700 && picked.check === "visible" && !after[0].chosen && after[0].check === "hidden", `picked: ${JSON.stringify(picked)}, All: ${JSON.stringify(after[0])}`);
    await shot(page, "drawer-one-on");
    await page.keyboard.press("Escape");
    await untilSub(page, `Only ${one}`);
    const line = await subText(page);
    eq(await doorsTop(page), topBefore, "the doors moved when one was picked");
    eq(await page.locator(".lx-focus-line").count(), 0, "a line of its own above the doors");
    eq(await page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "Choose your concepts" }).locator(".lx-row-value").innerText(), one, "the row names it");
    assert(!errors.length, `page errors: ${errors.slice(0, 3)}`);
    return { picked: one, thin: thinLabels, line };
  } finally {
    await context.close();
  }
});

await stage("while one is picked, Practice, reviews, a quick session, a topic and every game keep to its sentences and their words; a lesson doesn't change; it lasts a reload", async () => {
  const { context, page } = await phone();
  try {
    met = await meetConcepts(page);
    const id = met.enough[0].id;
    const lessonBefore = await planOf(page, "lesson");
    await page.evaluate(async (id) => (await import("/js/study/concept-focus.js")).setFocus([id]), id);
    await page.reload();
    await page.waitForSelector(TILE, { timeout: 20_000 });
    await untilSub(page, "Only ");
    // The words of its sentences: what a word game may ask.
    const words = await page.evaluate(async (id) => {
      const { ITEMS } = await import("/js/study/content.js");
      return [...new Set(ITEMS.filter((item) => item.concepts?.includes(id)).flatMap((item) => item.words.filter(([, lemma]) => lemma).map(([, lemma]) => lemma)))];
    }, id);
    const report = {};
    for (const [mode, arg] of [["practice"], ["reviews"], ["quick"], ["game", "fill"], ["game", "choose"], ["game", "arrange"], ["game", "match"], ["game", "meaning"], ["game", "word"]]) {
      const plan = await planOf(page, mode, arg);
      const name = arg ? `${mode}/${arg}` : mode;
      eq(plan.focus, [id], `${name}: the plan says what it keeps to`);
      const sentences = plan.steps.filter((step) => step.concepts);
      const off = sentences.filter((step) => !step.concepts.includes(id));
      eq(off.map((step) => step.item), [], `${name}: sentences without ${id}`);
      const strayWords = plan.steps.flatMap((step) => (step.words ?? []).filter((word) => !words.some((lemma) => word.toLowerCase().includes(lemma.toLowerCase()))));
      if (mode === "game" && (arg === "match")) assert(plan.steps.length && !strayWords.length, `${name}: words from elsewhere: ${strayWords}`);
      report[name] = plan.steps.length || plan.empty;
    }
    assert(typeof report.practice === "number" && report.practice > 0, `Practice asks nothing with it: ${report.practice}`);
    const lessonAfter = await planOf(page, "lesson");
    eq(lessonAfter.steps.map((s) => s.item ?? s.unit), lessonBefore.steps.map((s) => s.item ?? s.unit), "a lesson kept to it");
    eq(lessonAfter.focus, null, "a lesson says it keeps to it");
    // A press from Study's grid: the session asked keeps to it too.
    await page.locator(TILE, { hasText: "Fill the gap" }).click();
    await page.waitForSelector(SESSION, { timeout: 15_000 });
    const asked = await page.evaluate((S) => document.querySelector(S)?.lxStep?.item?.concepts ?? null, SESSION);
    assert(asked?.includes(id), `the first question pressed from Study: ${asked}`);
    return report;
  } finally {
    await context.close();
  }
});

await stage("All concepts puts everything back: Practice's line, the row's All, Practice asks from everything again", async () => {
  const { context, page } = await phone();
  try {
    met = await meetConcepts(page);
    await page.evaluate(async (id) => (await import("/js/study/concept-focus.js")).setFocus([id]), met.enough[0].id);
    await untilSub(page, "Only ");
    await page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "Choose your concepts" }).click();
    await sheet(page).locator('[data-part="list-row"]', { hasText: "All concepts" }).first().click();
    eq(await sheet(page).locator('[data-part="list-row"]').first().getAttribute("aria-pressed"), "true", "All concepts chosen again");
    await page.keyboard.press("Escape");
    await untilSub(page, "What you know, mixed");
    eq(await page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "Choose your concepts" }).locator(".lx-row-value").innerText(), "All", "the row's value");
    eq((await planOf(page, "practice")).focus, null, "Practice still keeps to it");
  } finally {
    await context.close();
  }
});

await stage("nothing to ask with what's picked: it says so and how to widen it, never an empty session", async () => {
  const { context, page } = await phone();
  try {
    met = await meetConcepts(page);
    await page.evaluate(async (id) => (await import("/js/study/concept-focus.js")).setFocus([id]), met.enough[0].id);
    // Nothing is due, so reviews have nothing to ask.
    const plan = await planOf(page, "reviews");
    assert(!plan.steps.length, `reviews asked ${plan.steps.length}`);
    const label = await page.evaluate(async (id) => (await import("/js/study/concept-focus.js")).conceptLabel(id), met.enough[0].id);
    assert(plan.empty?.includes(label) && /Choose more concepts on Study, or clear them/.test(plan.empty), `what it says: ${plan.empty}`);
    return plan.empty;
  } finally {
    await context.close();
  }
});

await stage("how it looks: Practice's line at 390 and 320, dark and light, whole inside its door, the doors where they were, nothing off the page; a recording of picking one and pressing a game", async () => {
  const shots = [];
  for (const [theme, width, height] of [["graphite", 390, 844], ["paper", 390, 844], ["graphite", 320, 568], ["paper", 320, 568]]) {
    const { context, page } = await phone({ theme, width, height });
    try {
      met = await meetConcepts(page);
      const topBefore = await doorsTop(page);
      await page.evaluate(async (ids) => (await import("/js/study/concept-focus.js")).setFocus(ids), [met.enough[0].id, met.enough[1].id]);
      await untilSub(page, "Only ");
      const m = await page.evaluate((S) => {
        const line = document.querySelector(S);
        const box = line.getBoundingClientRect();
        const door = line.closest('[data-part="study-door"]').getBoundingClientRect();
        return { sideways: document.documentElement.scrollWidth - innerWidth, inside: box.left >= door.left && box.right <= door.right && box.bottom <= door.bottom, size: parseFloat(getComputedStyle(line).fontSize) };
      }, SUB);
      eq(m.sideways, 0, `${theme} ${width}: sideways`);
      assert(m.size >= 12 && m.inside, `${theme} ${width}: ${JSON.stringify(m)}`);
      eq(await doorsTop(page), topBefore, `${theme} ${width}: the doors moved`);
      await shot(page, `study-focus-${theme}-${width}`);
      shots.push(`${theme} ${width}`);
    } finally {
      await context.close();
    }
  }
  const video = join(OUT, "walk-raw");
  rmSync(video, { recursive: true, force: true });
  const { context, page } = await phone({ video });
  try {
    await meetConcepts(page);
    await page.reload();
    await page.waitForSelector(TILE, { timeout: 20_000 });
    await settle(page, 900);
    await page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "Choose your concepts" }).scrollIntoViewIfNeeded();
    await settle(page, 700);
    await page.locator(`${PAGE} [data-part="list-row"]`, { hasText: "Choose your concepts" }).click();
    await settle(page, 1200);
    await sheet(page).locator('[data-part="list-row"]:not([disabled])').nth(1).click();
    await settle(page, 1200);
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.querySelector('[data-part="page"]').scrollTo({ top: 0, behavior: "smooth" }));
    await settle(page, 1500);
    await page.locator(TILE, { hasText: "Fill the gap" }).scrollIntoViewIfNeeded();
    await settle(page, 700);
    await page.locator(TILE, { hasText: "Fill the gap" }).click();
    await page.waitForSelector(SESSION, { timeout: 15_000 });
    await settle(page, 2000);
  } finally {
    await context.close();
  }
  const [file] = readdirSync(video);
  renameSync(join(video, file), join(OUT, "walk.webm"));
  rmSync(video, { recursive: true, force: true });
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(OUT, "walk.webm"), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", join(OUT, "walk.mp4")]);
  rmSync(join(OUT, "walk.webm"), { force: true });
  return shots.join(", ");
});

await browser.close().catch(() => {});
writeFileSync(join(OUT, "concepts-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((one) => !one.ok).length;
console.log(`concepts check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
