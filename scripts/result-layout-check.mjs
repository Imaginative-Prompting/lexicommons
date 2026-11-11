// A game's result laid out on a small phone (study/session.js setBar; components.css's answer bar), in Chrome by the shared session player:
// a new account that knows its words plays Fill the gap with wrong answers at 320 × 568 until a result has both More (an explanation cut to
// its lines) and its sentence on two lines, then at 390 × 844. On every result: no line of text drawn over another's (each text node's line
// boxes, as far as what clips them shows them), the result's title where it always is (the mark's width and the gap after it), and More,
// where it shows, under the explanation in its column. A planted line over the title is caught first. On 8 Nov More sat in the mark's column
// and pushed the title over, and the sentence's second line ran into its word for word under it (the way in, clipped, squeezed to nothing
// while its margins took up the gaps around it). Then, the sentence stopped, each of its words marked in turn: the underline's color under that
// word's box and no other's, on both lines of the wrapped sentence (read off the screen's pixels); and the word-for-word line's switch in view
// without scrolling at 390 × 844, and at 320 where the capped body holds it below its foot, the body fading there and a scroll bringing it into
// view. --files <copy> serves that copy's scripts and styles in place of the server's, to see the
// app from before fail. LOCAL only, path-nl seeded; through gpu.py's parallel lane, muted.
//   node scripts/result-layout-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--files <copy>]   (exit 0 = pass, 2 = not reached)
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { answerStep, SESSION } from "./fixtures/play-session.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const FILES = opt("files") && resolve(opt("files"));
// --only right: stage 4 alone.
const ONLY = opt("only");
if (!BASE || !outArg || !PERSIST || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("Usage: node scripts/result-layout-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--files <copy>] (a local server only)");
  process.exit(1);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.error("result layout check: past its 8-minute ceiling"), process.exit(1)), 8 * 60_000).unref();

let failed = 0;
let notReached = false;
const log = [];
const report = (ok, name, detail = "") => {
  if (!ok) failed++;
  const line = `${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`;
  console.log(line);
  log.push(line);
};

// A signed-in account written into the local database (its session cookie), so nothing here signs up.
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
function account() {
  const id = `rlc${randomBytes(6).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  const sql = [`INSERT INTO users (id, name, created_at) VALUES (${q(id)}, 'Layout Check', ${now})`, `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86_400_000}, 'result-layout-check')`].join("; ");
  execFileSync(join(APP, "node_modules/.bin/wrangler"), ["d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", sql], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  return cookie;
}

// In the page: every visible line of text in the session's result bar (each text node's line boxes, cut to what its clipping ancestors show),
// the pairs of lines from different nodes that overlap by more than 2 px both ways, the title's and More's places.
const MEASURE = ({ session, plant }) => {
  const bar = document.querySelector(`${session} [data-part="answer-bar"]`);
  if (!bar) return null;
  if (plant) {
    const title = bar.querySelector('[data-part="feedback-title"]');
    const planted = document.createElement("span");
    planted.textContent = "Planted";
    planted.style.cssText = "position: absolute; left: 0; top: 0; font-size: 16px;";
    title.style.position = "relative";
    title.append(planted);
  }
  const shown = (rect, el) => {
    let [l, t, r, b] = [rect.left, rect.top, rect.right, rect.bottom];
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return null;
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const c = a.getBoundingClientRect();
        if (cs.overflowX !== "visible") (l = Math.max(l, c.left)), (r = Math.min(r, c.right));
        if (cs.overflowY !== "visible") (t = Math.max(t, c.top)), (b = Math.min(b, c.bottom));
      }
    }
    return r - l > 1 && b - t > 1 ? [l, t, r, b] : null;
  };
  const lines = [];
  const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
  let node = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode(), node++) {
    if (!n.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const rect of range.getClientRects()) {
      const box = shown(rect, n.parentElement);
      if (box) lines.push({ node, text: n.textContent.trim().slice(0, 28), part: n.parentElement.closest("[data-part]")?.getAttribute("data-part") ?? "", box: box.map(Math.round) });
    }
  }
  const overlaps = [];
  for (let a = 0; a < lines.length; a++)
    for (let b = a + 1; b < lines.length; b++) {
      if (lines[a].node === lines[b].node) continue;
      const [l1, t1, r1, b1] = lines[a].box;
      const [l2, t2, r2, b2] = lines[b].box;
      const w = Math.min(r1, r2) - Math.max(l1, l2);
      const h = Math.min(b1, b2) - Math.max(t1, t2);
      if (w > 2 && h > 2) overlaps.push(`"${lines[a].text}" (${lines[a].part}) and "${lines[b].text}" (${lines[b].part}), ${w} × ${h} px`);
    }
  const rect = (el) => el?.getBoundingClientRect() ?? null;
  const mark = rect(bar.querySelector('[data-part="feedback"] > .lx-icon'));
  const title = rect(bar.querySelector('[data-part="feedback-title"]'));
  const text = rect(bar.querySelector('[data-part="feedback-text"]'));
  const more = rect([...bar.querySelectorAll("button")].find((b) => b.textContent.trim() === "More"));
  const spokenLines = new Set([...bar.querySelectorAll('[data-part="spoken-word"]')].map((w) => Math.round(w.getBoundingClientRect().top))).size;
  return {
    overlaps,
    titleAfterMark: mark && title ? Math.round(title.left - mark.right) : null,
    more: more ? { left: Math.round(more.left), textLeft: Math.round(text?.left ?? -1), top: Math.round(more.top), textBottom: Math.round(text?.bottom ?? -1) } : null,
    spokenLines,
  };
};

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });

// 4. Right answers (Settings → Games → Word for word on right answers, on by default; session.js finishStep): path-nl l018-1, "Vandaag zoek ik
// mijn sleutel." (its English rewords it: "search for", "looking for"), answered right in Which is right?, shows ONE word-for-word line: in Dutch
// order once it has slid there, labeled Word for word with "search" marked, with its order switch, and no English-order word-for-word line; a
// sentence whose word for word is its English (the same order, not reworded) shows none; the switch off, today's Right (the English-order line
// alone); a miss as ever (the Dutch-order line). Each result fits as an answered step must (component-check's ANSWERED): the step not
// scrolling, the right sentence whole in view, Continue on the screen. Played on a set plan (session.js's still route, as component-check's).
// Then the same sentence in What does it say? (its English built from tiles), whose line was off before 9 Nov 2026: right, the same one
// Dutch-order line, on by default; the switch off, none; a miss, the line; and no hint offered before answering (it stays off by default).
const RIGHT = (session) => {
  const s = document.querySelector(session);
  const bar = s?.querySelector('[data-part="answer-bar"]');
  if (!bar?.getAttribute("data-meaning")) return null;
  const act = s.querySelector('[data-part="activity"]');
  const body = bar.querySelector(".lx-answer-body");
  if (body) body.scrollTop = 0;
  const blocks = [...bar.querySelectorAll(".lx-answer-literal")];
  const line = blocks[0]?.querySelector('[data-part="literal-line"]');
  const sentence = bar.querySelector('[data-part="spoken-line"]');
  const capped = bar.hasAttribute("data-capped");
  let whole = null;
  if (sentence && body) {
    const r = sentence.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const foot = capped ? b.bottom - (parseFloat(getComputedStyle(body).paddingBottom) || 0) : b.bottom;
    whole = r.top >= b.top - 0.5 && r.bottom <= foot + 0.5 && r.bottom <= innerHeight + 0.5;
  }
  const actions = [...bar.querySelectorAll(".lx-answer-actions button")].filter((b) => b.getClientRects().length);
  // Every control of the result (a button, a link, the order switch, a row that opens) whole where the bar shows it: inside the body's box and
  // above a capped body's fade, above Continue, on the screen. One under Continue, or in the fade, peeks out or is gone (9 Nov 2026: What does
  // it say? at 320 × 568 had its NL/EN switch half under See how it went and its Verb second row out of sight), and a scroll that would
  // bring it up is shown by nothing.
  const go = bar.querySelector('[data-part="button"][data-variant="white"]');
  const shown = body?.getBoundingClientRect();
  const fadeAt = shown ? shown.bottom - (capped ? parseFloat(getComputedStyle(body).paddingBottom) || 0 : 0) : innerHeight;
  const floor = Math.min(fadeAt, go ? go.getBoundingClientRect().top : innerHeight, innerHeight);
  const controls = body ? [...body.querySelectorAll('button, a[href], [role="switch"], [role="radio"]')].filter((c) => c.getClientRects().length) : [];
  // What a control draws (its words and its symbols), never its box: a box reaches past them to make a 44 px target, over the body's top and
  // into Continue's, where nothing of it shows.
  const ink = (c) => {
    const rects = [];
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    for (const mark of c.querySelectorAll("svg, img")) rects.push(...mark.getClientRects());
    const drawn = rects.filter((r) => r.width && r.height);
    if (!drawn.length) return c.getBoundingClientRect();
    return { top: Math.min(...drawn.map((r) => r.top)), bottom: Math.max(...drawn.map((r) => r.bottom)) };
  };
  const under = controls
    .filter((c) => {
      const r = ink(c);
      return r.bottom > floor + 0.5 || r.top < (shown?.top ?? 0) - 0.5;
    })
    .map((c) => (c.getAttribute("aria-label") || c.textContent).trim().replace(/\s+/g, " ").slice(0, 30) || c.getAttribute("data-part") || c.tagName);
  // The card's tag (Not word for word) on its top edge: clear of the card's own words, and not cut by the step's top.
  const tagEl = s.querySelector('[data-part="step-tags"][data-on="card"]');
  let tag = null;
  if (tagEl && act) {
    const t = tagEl.getBoundingClientRect();
    const walker = document.createTreeWalker(tagEl.parentElement, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let over = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (tagEl.contains(node) || !node.textContent.trim()) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) over = Math.max(over, Math.min(Math.min(r.right, t.right) - Math.max(r.left, t.left), Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top)));
    }
    tag = { over: Math.round(over), cut: Math.round(act.getBoundingClientRect().top - t.top) };
  }
  return {
    tag,
    meaning: bar.getAttribute("data-meaning"),
    blocks: blocks.length,
    order: line?.getAttribute("data-order") ?? null,
    label: blocks[0]?.querySelector(".lx-reword-label")?.textContent.trim() ?? null,
    marked: [...(blocks[0]?.querySelectorAll(".lx-reword-changed") ?? [])].map((chunk) => chunk.textContent.trim()),
    switch: Boolean(blocks[0]?.querySelector('[data-part="order-toggle"]')),
    englishOrderLines: bar.querySelectorAll(".lx-answer-reword").length,
    wordForWords: [...bar.querySelectorAll(".lx-reword-label")].length,
    scroll: act ? Math.round(act.scrollHeight - act.clientHeight) : null,
    whole,
    offScreen: actions.filter((b) => b.getBoundingClientRect().bottom > innerHeight + 0.5).map((b) => b.textContent.trim()),
    under,
    controls: controls.length,
    // How the step made room: its fit level, the fold, the capped body and whether it scrolls.
    fit: s.getAttribute("data-fit"),
    fold: s.hasAttribute("data-fold"),
    foldLevel: s.getAttribute("data-fold"),
    capped,
    bodyScrolls: body ? /auto|scroll/.test(getComputedStyle(body).overflowY) && body.scrollHeight > body.clientHeight + 1 : false,
  };
};
async function rightAnswers({ width, height }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
  await context.addCookies([{ name: "lc_session", value: account(), url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
  await context.route(/\/(js|css)\/.*\.(js|css)(\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const still = path.endsWith("/js/study/session.js");
    if (!FILES && !still) return route.continue();
    let body;
    if (FILES) {
      const file = join(FILES, "public", path);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
      body = readFileSync(file, "utf8");
    } else body = await (await route.fetch()).text();
    if (still) body = body.replace("const plan = planSession(mode, arg);", 'const plan = mode === "still" ? globalThis.__stillPlan : planSession(mode, arg);');
    await route.fulfill({ status: 200, contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await knowWords(page);
  // The sentences: l018-1, and one of path-nl's whose word for word is its English (its order kept, not reworded), with wrong choices.
  const ids = await page.evaluate(async () => {
    const content = await import("/js/study/content.js");
    const { rewordingOf } = await import("/js/study/reword.js");
    const isFilm = (one) => /(^|\/)l018-1$/.test(one.id) || one.words?.map(([t]) => t).join(" ") === "Vandaag zoek ik mijn sleutel";
    // (A new account's library comes in after its start: up to 40 s.)
    for (let i = 0; i < 400 && !content.ITEMS.some(isFilm); i++) await new Promise((r) => setTimeout(r, 100));
    // (Its word for word the English itself where one is: "I have the book" for Ik heb het boek.)
    const bare = (text) => String(text).toLowerCase().replace(/[.?!,]/g, "").trim();
    const kept = (one) => one.words?.length >= 4 && one.wrong?.length >= 2 && one.means && (!one.english || one.english.every((v, i) => v === i)) && !rewordingOf(one, null);
    const plain = content.ITEMS.find((one) => kept(one) && bare(one.literal.map((chunk) => chunk.text ?? chunk[0]).join(" ")) === bare(one.means)) ?? content.ITEMS.find(kept);
    const film = content.ITEMS.find(isFilm);
    return { film: film?.id ?? null, plain: plain?.id ?? null, seen: `${content.ITEMS.length} sentences in ${localStorage.getItem("lx.learning.v1")}, ids like ${content.ITEMS.slice(0, 3).map((one) => one.id).join(", ")}` };
  });
  const results = {};
  const answer = async (id, { wrong = false, rightLiteral = true, kind = "choose" } = {}) => {
    await page.evaluate(() => (location.hash = "#study"));
    await page.waitForTimeout(600);
    const item = await page.evaluate(
      async ({ id, rightLiteral, kind }) => {
        try {
          (await import("/js/study/settings.js")).setStudySetting("right.literal", rightLiteral);
        } catch {}
        const content = await import("/js/study/content.js");
        const { planSession } = await import("/js/study/plan.js");
        const item = content.ITEMS.find((one) => one.id === id);
        if (!item) return null;
        // What does it say?: its step as a lesson makes it (study/lesson.js translateStep), with no stray tiles.
        const step = kind === "translate" ? { ...(await import("/js/study/lesson.js")).translateStep(item, [], []), skill: "read" } : { kind: "choose", skill: "read", item };
        globalThis.__stillPlan = { title: "Check", steps: [step], instead: planSession("game", kind).instead };
        location.hash = "#study/session/still/check";
        return { wrong: item.wrong ?? [] };
      },
      { id, rightLiteral, kind },
    );
    if (!item) return { none: `no ${id}` };
    const ready = kind === "translate" ? '[data-part="arrange-bank"] [data-part="tile"]' : '[data-part="choice"]';
    const drawn = await page
      .waitForFunction(({ session, id, ready }) => document.querySelector(session)?.getAttribute("data-item") === id && document.querySelectorAll(`${session} ${ready}`).length >= 2, { session: SESSION, id, ready }, { timeout: 15_000 })
      .then(() => true, () => false);
    if (!drawn) return { none: `${id} never drawn` };
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    if (kind === "translate") {
      // Before answering: a hint, if one's offered (Hint: Dutch order).
      const hints = await page.locator(`${SESSION} [data-part="answer-bar"] button`, { hasText: /Hint/ }).count();
      await answerStep(page, { wrong, next: false });
      await page.waitForTimeout(1800);
      const m = await page.evaluate(RIGHT, SESSION);
      if (!m) return { none: `${id}: no result` };
      // Its explanation folded for room (data-fold="2"): the idea's row under the sentence opens it whole, so nothing's lost.
      const folded = await page.evaluate((S) => {
        const why = document.querySelector(`${S} [data-part="answer-bar"] [data-part="feedback-text"]`);
        return why && !why.getClientRects().length ? why.textContent.replace(/\s+/g, " ").trim() : null;
      }, SESSION);
      if (!folded) return { ...m, hints };
      // The idea's sheet (after-answer.js): on a first meeting the same line; after it, its Why, which says it at length.
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="concept-chip"]`).first().click();
      const sheet = await page
        .waitForFunction(() => {
          const body = document.querySelector('.lx-sheet-layer:not([hidden]) [data-part="concept-sheet"]');
          if (!body) return null;
          const text = (selector) => body.querySelector(selector)?.textContent.replace(/\s+/g, " ").trim() ?? "";
          return { name: text(".lx-concept-name"), short: text(".lx-concept-short"), why: text(".lx-concept-why") };
        }, null, { timeout: 8000 })
        .then((handle) => handle.jsonValue(), () => null);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      // Closed by its key, the sheet gives the chip its focus back: the still is of the result at rest, as a finger leaves it.
      await page.evaluate(() => document.activeElement?.blur?.());
      const opened = Boolean(sheet && (sheet.short.includes(folded.slice(0, 40)) || sheet.why.length > 40));
      return { ...m, hints, folded: { words: folded.slice(0, 60), opened, sheet: sheet && { name: sheet.name, short: sheet.short.slice(0, 60), why: sheet.why.slice(0, 80) } } };
    }
    const choices = page.locator(`${SESSION} [data-part="choice"]`);
    const wrongOnes = new Set(item.wrong.map((w) => w.trim()));
    for (let i = 0; i < (await choices.count()); i++)
      if (wrongOnes.has((await choices.nth(i).textContent()).trim()) === wrong) {
        await choices.nth(i).click();
        break;
      }
    // The bar coming up and the word for word sliding into order, over.
    await page.waitForTimeout(1800);
    const m = await page.evaluate(RIGHT, SESSION);
    return m ?? { none: `${id}: no result` };
  };
  if (ids.film) {
    results.right = await answer(ids.film);
    await page.screenshot({ path: join(OUT, `right-${width}-l018-1.png`) });
    results.off = await answer(ids.film, { rightLiteral: false });
    await page.screenshot({ path: join(OUT, `right-${width}-l018-1-switch-off.png`) });
    results.miss = await answer(ids.film, { wrong: true });
    await page.screenshot({ path: join(OUT, `right-${width}-l018-1-miss.png`) });
  }
  if (ids.film) {
    results.translate = await answer(ids.film, { kind: "translate" });
    await page.screenshot({ path: join(OUT, `right-${width}-l018-1-translate.png`) });
    results.translateOff = await answer(ids.film, { kind: "translate", rightLiteral: false });
    results.translateMiss = await answer(ids.film, { kind: "translate", wrong: true });
    await page.screenshot({ path: join(OUT, `right-${width}-l018-1-translate-miss.png`) });
  }
  if (ids.plain) {
    results.plain = await answer(ids.plain);
    await page.screenshot({ path: join(OUT, `right-${width}-${ids.plain.replace(/\//g, "-")}-plain.png`) });
  }
  await context.close();
  return { ids, results, errors };
}
const fitsAnswered = (m) =>
  (m.scroll > 1 ? `the step scrolls ${m.scroll}px` : null) ??
  (m.whole === false ? "the right sentence not whole in view" : null) ??
  (m.offScreen?.length ? `below the screen: ${m.offScreen.join(", ")}` : null) ??
  (m.under?.length ? `under the bar or its fade: ${m.under.join(", ")}` : null);
function judgeRight(size, r) {
  const { ids, results: x } = r;
  if (!ids.film) return report(false, `${size}: path-nl l018-1 in the app's sentences`, `not found (${ids.seen}): is path-nl seeded?`);
  const film = x.right ?? {};
  const right = film.meaning === "right" && film.blocks === 1 && film.order === "dutch" && film.label === "Word for word:" && film.marked.some((w) => /search/i.test(w)) && film.switch && film.englishOrderLines === 0 && film.wordForWords === 1;
  report(right, `${size}: a right answer on l018-1 shows one word-for-word line, slid into Dutch order, labeled Word for word with "search" marked, its order switch, no English-order line`, JSON.stringify(film));
  const fit = film.none ? film.none : fitsAnswered(film);
  report(!fit, `${size}: that result fits (the step not scrolling, the sentence whole in view, Continue on the screen)`, fit ?? "");
  const off = x.off ?? {};
  report(off.meaning === "right" && off.blocks === 0 && off.englishOrderLines === 1, `${size}: Word for word on right answers off: today's right answer (the English-order line alone)`, JSON.stringify(off));
  const miss = x.miss ?? {};
  report(miss.meaning === "wrong" && miss.blocks === 1 && miss.order === "dutch" && miss.englishOrderLines === 0 && miss.wordForWords === 1 && !fitsAnswered(miss), `${size}: a miss as ever: one Dutch-order line, labeled, fitting`, JSON.stringify(miss));
  // The card's Not word for word tag, answered (right and missed): over none of the card's words, whole inside the step (9 Nov: at 320 it sat on
  // "Today I'm looking for my key.").
  const tagOk = (m) => m.tag && m.tag.over <= 1 && m.tag.cut <= 0;
  report(tagOk(film) && tagOk(miss), `${size}: l018-1's Not word for word tag, answered right and missed, clear of the card's words and whole in the step`, JSON.stringify({ right: film.tag, miss: miss.tag }));
  // What does it say? on the same sentence: its line on a right answer as every game's, on by default; never a hint unless turned on.
  const tr = x.translate ?? {};
  const oneLine = (m) => m.meaning === "right" && m.blocks === 1 && m.order === "dutch" && m.label === "Word for word:" && m.marked?.some((w) => /search/i.test(w)) && m.switch && m.englishOrderLines === 0 && m.wordForWords === 1;
  report(oneLine(tr) && !fitsAnswered(tr), `${size}: What does it say? answered right on l018-1: the same one word-for-word line in Dutch order, labeled, "search" marked, its switch, fitting`, JSON.stringify(tr));
  report(tr.hints === 0, `${size}: What does it say? offers no hint before answering (off by default)`, `${tr.hints} hint button(s)`);
  const trOff = x.translateOff ?? {};
  report(trOff.meaning === "right" && trOff.blocks === 0, `${size}: What does it say? with Word for word on right answers off: no Dutch-order line`, JSON.stringify(trOff));
  const trMiss = x.translateMiss ?? {};
  report(trMiss.meaning === "wrong" && trMiss.blocks === 1 && trMiss.order === "dutch" && !fitsAnswered(trMiss), `${size}: What does it say? missed: its Dutch-order line, fitting`, JSON.stringify(trMiss));
  // Folded for room, its explanation is a tap away: the idea's row opens it whole.
  if (trMiss.folded) report(trMiss.folded.opened, `${size}: What does it say? missed, its explanation folded for room: the idea's row opens the idea, explained (the same line, or its Why at length)`, JSON.stringify(trMiss.folded));
  if (!ids.plain) report(false, `${size}: a sentence whose word for word is its English found`, "none in the app's sentences");
  else {
    const plain = x.plain ?? {};
    report(plain.meaning === "right" && plain.blocks === 0 && !fitsAnswered(plain), `${size}: a right answer whose word for word is its English (${ids.plain}): no line`, JSON.stringify(plain));
  }
  report(!r.errors.length, `${size}: right answers, no page errors`, r.errors.join(" | ").slice(0, 200));
}

async function play({ width, height, name, plant = false, until = null, most = 6, inspect = null }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
  await context.addCookies([{ name: "lc_session", value: account(), url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
  if (FILES) {
    await context.route(/\/(js|css)\/.*\.(js|css)(\?.*)?$/, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const file = join(FILES, "public", path);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
      await route.fulfill({ status: 200, contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: readFileSync(file) });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await knowWords(page);
  await page.evaluate(() => (location.hash = "#study/session/game/fill"));
  await page.waitForSelector(SESSION, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  const results = [];
  for (let i = 1; i <= most; i++) {
    let step;
    try {
      step = await answerStep(page, { wrong: true, next: false });
    } catch {
      break;
    }
    // The result's own moves (the bar coming up, the word for word sliding into order) over.
    await page.waitForTimeout(1600);
    const m = await page.evaluate(MEASURE, { session: SESSION, plant });
    if (!m) break;
    const file = `${name}-${i}.png`;
    await page.screenshot({ path: join(OUT, file) });
    results.push({ i, item: step.item?.id ?? null, file, ...m });
    if (inspect && (!until || until(m))) results.at(-1).inspected = await inspect(page, `${name}-${i}`);
    if (plant || (until && until(m))) break;
    const next = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(900);
    if (await page.locator('[data-part="session-summary"]').count()) break;
  }
  await context.close();
  return { results, errors };
}

// The sentence's marks (a word being said, data-speaking; a new word, data-state target) are its own words' underlines: with the sentence stopped,
// each word marked in turn, the underline's color is under that word's box and under no other's, on either line of a sentence that wraps. Read
// off the screen's pixels (the bar's picture), since an underline is no box of its own.
async function marksUnderOwnWords(page, name) {
  await page.evaluate(async () => (await import("/js/study/voice.js")).stopSpeaking());
  await page.waitForTimeout(300);
  const words = await page.evaluate((session) => {
    const line = document.querySelector(`${session} [data-part="answer-bar"] [data-part="spoken-line"]`);
    return [...(line?.querySelectorAll('[data-part="spoken-word"], [data-part="target-word"]') ?? [])].map((w, i) => {
      w.dataset.lxMark = String(i);
      const r = w.getBoundingClientRect();
      return { i, text: w.textContent.trim(), box: [r.left, r.top, r.right, r.bottom], marked: w.hasAttribute("data-speaking") };
    });
  }, SESSION);
  if (!words.length) return { error: "no sentence in the result" };
  const lines = new Set(words.map((w) => Math.round(w.box[1]))).size;
  const out = [];
  for (const word of words) {
    const color = await page.evaluate(({ session, i }) => {
      const line = document.querySelector(`${session} [data-part="answer-bar"] [data-part="spoken-line"]`);
      for (const w of line.querySelectorAll("[data-lx-mark]")) w.removeAttribute("data-speaking");
      const w = line.querySelector(`[data-lx-mark="${i}"]`);
      w.setAttribute("data-speaking", "");
      return getComputedStyle(w).textDecorationColor;
    }, { session: SESSION, i: word.i });
    await page.waitForTimeout(120);
    const [r, g, b] = color.match(/[\d.]+/g).map(Number);
    const shot = await page.screenshot();
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    const scale = info.width / page.viewportSize().width;
    // The underline's color in the band under a word's box (its text's foot to 10 px below), counted in device pixels.
    const under = ([left, , right, bottom]) => {
      let n = 0;
      for (let y = Math.round(bottom * scale) - 2; y < Math.round((bottom + 10) * scale); y++)
        for (let x = Math.round(left * scale); x < Math.round(right * scale); x++) {
          const at = (y * info.width + x) * info.channels;
          if (Math.abs(data[at] - r) < 40 && Math.abs(data[at + 1] - g) < 40 && Math.abs(data[at + 2] - b) < 40) n++;
        }
      return n;
    };
    const own = under(word.box);
    const others = words.filter((w) => w.i !== word.i).map((w) => ({ text: w.text, n: under(w.box) })).filter((o) => o.n > 4);
    out.push({ text: word.text, own, others });
    if (out.length === 1) await page.screenshot({ path: join(OUT, `${name}-mark-${word.i}.png`) });
  }
  await page.evaluate((session) => {
    for (const w of document.querySelectorAll(`${session} [data-lx-mark]`)) (w.removeAttribute("data-speaking"), w.removeAttribute("data-lx-mark"));
  }, SESSION);
  return { lines, words: out, before: words.filter((w) => w.marked).map((w) => w.text) };
}
// The word-for-word line's order switch: on a phone with room, in view without scrolling; where the capped body holds it below its foot, the
// body fades at its foot (there's more) and scrolling it brings the switch into view.
async function switchReachable(page) {
  return page.evaluate(async (session) => {
    const bar = document.querySelector(`${session} [data-part="answer-bar"]`);
    const body = bar?.querySelector(".lx-answer-body");
    const sw = bar?.querySelector('[data-part="order-toggle"]');
    if (!body || !sw) return { none: true };
    const inside = () => {
      const a = sw.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && a.bottom <= innerHeight;
    };
    const atFirst = inside();
    const capped = bar.hasAttribute("data-capped");
    const mask = getComputedStyle(body).maskImage || getComputedStyle(body).webkitMaskImage || "none";
    const scrolls = body.scrollHeight > body.clientHeight + 1;
    body.scrollTop = body.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterScroll = inside();
    body.scrollTop = 0;
    return { atFirst, capped, fade: mask !== "none", scrolls, afterScroll };
  }, SESSION);
}
const inspectResult = async (page, name) => ({ marks: await marksUnderOwnWords(page, name), switch: await switchReachable(page) });
const judgeInspected = (label, r) => {
  const marks = r.inspected?.marks;
  if (marks?.words) {
    const bad = marks.words.filter((w) => w.own < 20 || w.others.length);
    report(!bad.length, `${label} (${r.item}): each word's mark under its own word, on ${marks.lines} line(s)`, bad.map((w) => `${w.text}: ${w.own} px under it, ${w.others.map((o) => `${o.n} under ${o.text}`).join(", ") || "none elsewhere"}`).join("; ") || marks.words.map((w) => `${w.text} ${w.own}`).join(", "));
    report(!marks.before.length, `${label} (${r.item}): the sentence stopped, no word marked as being said`, marks.before.join(", "));
  } else report(false, `${label} (${r.item}): the sentence's marks read`, marks?.error ?? "nothing read");
  const sw = r.inspected?.switch;
  if (sw && !sw.none) {
    if (sw.atFirst) report(true, `${label} (${r.item}): the word-for-word switch in view without scrolling`);
    else report(sw.capped && sw.fade && sw.scrolls && sw.afterScroll, `${label} (${r.item}): the switch below the body's foot: the body capped, fading at its foot, and scrolling brings it into view`, JSON.stringify(sw));
  }
  return sw;
};

// The usual place of the title: the mark's width and this gap after it, on every result without More.
const USUAL_GAP = 12;
const judge = (label, r) => {
  report(!r.overlaps.length, `${label} (${r.item}, ${r.file}): no line of text over another`, r.overlaps.slice(0, 3).join("; ") || `${r.spokenLines} line(s) of sentence`);
  report(r.titleAfterMark === USUAL_GAP, `${label} (${r.item}): the title ${USUAL_GAP} px after the mark, as on every result`, `${r.titleAfterMark} px`);
  if (r.more) report(r.more.left === r.more.textLeft && r.more.top >= r.more.textBottom - 1, `${label} (${r.item}): More under the explanation, in its column`, `More at x ${r.more.left}, the explanation at ${r.more.textLeft}`);
};

try {
  if (ONLY === "right") {
    for (const [width, height] of [[320, 568], [390, 844]]) judgeRight(`${width} × ${height}`, await rightAnswers({ width, height }));
    throw Object.assign(new Error("only right"), { only: true });
  }
  // 1. The plant: a line put over the title is caught.
  const planted = await play({ width: 320, height: 568, name: "plant", plant: true });
  const caught = planted.results[0]?.overlaps.some((o) => o.includes("Planted"));
  report(Boolean(caught), "PLANT a line of text put over the result's title is caught as an overlap", planted.results[0]?.overlaps[0] ?? "nothing found");
  if (!caught) process.exitCode = 3;

  // 2. 320 × 568: on to a result with More and a sentence on two lines; every result on the way judged.
  const both = (m) => Boolean(m.more) && m.spokenLines >= 2;
  const small = await play({ width: 320, height: 568, name: "320", until: both, most: 8, inspect: inspectResult });
  for (const r of small.results) judge("320 × 568", r);
  const reached = small.results.find(both);
  if (reached) judgeInspected("320 × 568", reached);
  if (!reached) {
    notReached = true;
    console.log("NOT REACHED  320 × 568: no result with More and its sentence on two lines in 8 steps");
  } else report(true, "320 × 568: a result with More and its sentence on two lines reached", `${reached.item}, ${reached.file}`);
  report(!small.errors.length, "320 × 568: no page errors", small.errors.join(" | ").slice(0, 200));

  // 3. 390 × 844, the same game: every result judged.
  const roomy = await play({ width: 390, height: 844, name: "390", most: 4, inspect: inspectResult });
  for (const r of roomy.results) {
    judge("390 × 844", r);
    const sw = judgeInspected("390 × 844", r);
    if (sw && !sw.none) report(sw.atFirst, `390 × 844 (${r.item}): a phone with room shows the switch without scrolling`, JSON.stringify(sw));
  }
  report(roomy.results.length > 0, "390 × 844: results reached", `${roomy.results.length}`);
  report(!roomy.errors.length, "390 × 844: no page errors", roomy.errors.join(" | ").slice(0, 200));

  // 4. Right answers, at both sizes.
  for (const [width, height] of [[320, 568], [390, 844]]) judgeRight(`${width} × ${height}`, await rightAnswers({ width, height }));
} catch (error) {
  if (!error.only) throw error;
} finally {
  await browser.close();
}
writeFileSync(join(OUT, "report.txt"), log.join("\n") + "\n");
if (process.exitCode === 3) process.exit(3);
console.log(failed ? `\nresult layout check: ${failed} FAILED` : notReached ? "\nresult layout check: NOT REACHED (exit 2)" : "\nall passed");
process.exit(failed ? 1 : notReached ? 2 : 0);
