// Home's cards (know/home-cards.js; docs/design-bible.md, "Home's cards") in headless Chrome on a LOCAL server with the open library (npm run
// local: it creates and deletes nothing it didn't make, but signs up a test account), as an iPhone learner a few days in with an AI connected
// and reminders paused:
//   - Last 4 weeks waits until all four weeks have words; there's no "More to do" heading;
//   - the notices are doors (a border and a hard edge), Reminders says only what's true now and the way back, Not now is the install card's cross;
//   - with no book, the book card is Read's own book and opens Read; with one, a Reading heading whose All books opens Read, then the book: no
//     border, its teal tile with a hard edge in teal-deep, the book's own name on its cover, its title and one line under it;
//   - the book shut while it comes up the screen, open once its top is a quarter of the way down, closing on the way back; open at once with
//     animations off;
//   - your AI under its own heading: no border, the exchange drawn on its sun tile, Tinta on its floor clear of both lines; "Your turn" when the AI
//     had the last word; a tap on Tinta there a poke, his alone (the card neither opens nor looks pressed, against a press on the card that does);
//   - at 320 wide every card's title and the cover's whole, never cut.
// The layout before (soft filled cards under "More to do", a row inside the book card) fails it. Screenshots in <outDir>/shots.
// Usage (headless Chrome, through the GPU queue's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "home cards check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/home-cards-check.mjs http://localhost:<port> <outDir> [--book <shelf title>]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { goRouted } from "./fixtures/routed.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg = "home-cards-check-out"] = argv;
const BOOK = argv.includes("--book") ? argv[argv.indexOf("--book") + 1] : "Alice";
const OUT = resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("home-cards-check signs up a test account: give it a local server, e.g. http://localhost:9090");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });
setTimeout(() => {
  console.error("ceiling: 6 minutes");
  process.exit(3);
}, 6 * 60_000).unref();

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

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE, serviceWorkers: "block" });
// An AI connected (the server's /api/me says so), and reminders that paused themselves (the server's report says so).
await context.route("**/api/me", async (route) => {
  const response = await route.fetch();
  const body = await response.json().catch(() => null);
  if (body && typeof body === "object") body.aiConnected = true;
  await route.fulfill({ response, json: body });
});
await context.route("**/api/reminders/report", (route) => route.fulfill({ json: { stopped: true } }));
await context.addInitScript(() => {
  try {
    localStorage.setItem("lx.reminders.on", "1");
  } catch {}
});
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
const shot = (name) => page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
const CARDS = '[data-part="page"]:not([data-ghost]) .lx-home-cards';
const home = async () => {
  await goRouted(page, BASE, "#today");
  await page.waitForSelector(`${CARDS} [data-part="home-card"]`, { timeout: 30_000 });
  await page.waitForTimeout(800);
};
// What the cards' list holds, in order: each heading's words and link, each card's variant, link, surface and words.
const list = () =>
  page.evaluate((cards) => {
    const box = document.querySelector(cards);
    return [...(box?.children ?? [])].map((node) => {
      if (node.matches(".lx-hc-head")) {
        const link = node.querySelector('[data-part="section-link"]');
        return { head: node.querySelector('[data-part="section-title"]')?.textContent.trim(), link: link ? { href: link.getAttribute("href"), text: link.textContent.trim() } : null };
      }
      const style = getComputedStyle(node);
      return {
        card: node.dataset.variant,
        href: node.getAttribute("href"),
        border: parseFloat(style.borderTopWidth),
        edge: style.boxShadow,
        text: node.textContent.replace(/\s+/g, " ").trim(),
      };
    });
  }, CARDS);

// ---------- a learner a few days in, on an iPhone, an AI connected, reminders paused ----------
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Home Cards Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]");
await page.evaluate(async () => {
  await (await import("/js/study/packs.js")).syncLibraryPacks();
  const { pathLessons } = await import("/js/study/path.js");
  const { record } = await import("/js/study/progress.js");
  const { finishedLesson } = await import("/js/study/done.js");
  for (let i = 0; i < 300 && !pathLessons().length; i++) await new Promise((done) => setTimeout(done, 100));
  const lesson = pathLessons()[0];
  const at = Date.now() - 2 * 86400000;
  record(lesson.things.filter((one) => !one.formOnly).flatMap((thing) => [0, 1, 2].map((n) => ({ concept: thing.unit, at: at + n * 1000, outcome: "right", test: "recall", skill: "read" }))));
  finishedLesson(lesson.id, at + 5000);
});
// A practice kept on this device, its AI having had the last word (the lines are the check's own, not a real AI's).
const keepPractice = (answered) =>
  page.evaluate(async (answered) => {
    const { savePractice } = await import("/js/practice/store.js");
    const now = Date.now() - 3 * 3600000;
    await savePractice(
      { id: "home-cards-check-1", mode: "app", settings: { kind: "chat", language: "nl" }, client: "Claude", createdAt: now, startedAt: now, endedAt: now + 600000, state: "ended" },
      [
        { seq: 1, who: "ai", type: "reply", say: [{ nl: "Hoi! Wat heb je vandaag gedaan?", en: "Hi! What did you do today?" }] },
        { seq: 2, who: "you", type: "said", text: "Ik heb gewerkt en daarna gekookt." },
        { seq: 3, who: "ai", type: "reply", say: [{ nl: "Lekker! Wat ga je dit weekend doen?", en: "Nice! What are you doing this weekend?" }] },
        ...(answered ? [{ seq: 4, who: "you", type: "said", text: "Ik ga met mijn zus fietsen." }] : []),
      ],
    );
  }, answered);
await keepPractice(false);
await page.reload();
await page.waitForSelector("html[data-app-ready]");
await home();

await stage("a few days in: no Last 4 weeks yet, no More to do; the notices, Read's own book, Your AI, in that order", async () => {
  const page_ = await page.locator('[data-part="page"]:not([data-ghost])').first().textContent();
  assert(!page_.includes("Last 4 weeks"), "Last 4 weeks shows with three days of words");
  assert(!page_.includes("More to do"), "a More to do heading");
  const items = await list();
  const shape = items.map((one) => one.head ?? one.card).join(" · ");
  assert(shape === "paused · install · book · Your AI · ai", `order: ${shape}`);
  return shape;
});

await stage("the notices are doors: a border and a hard edge; Reminders says what's true now, never what went unanswered; Not now is the cross", async () => {
  const items = await list();
  for (const variant of ["paused", "install"]) {
    const card = items.find((one) => one.card === variant);
    assert(card.border >= 2 && card.edge !== "none", `${variant}: border ${card.border}, edge ${card.edge}`);
  }
  const paused = items.find((one) => one.card === "paused");
  assert(paused.text.includes("Turn them back on anytime") && !/unanswered/i.test(paused.text), `paused: ${paused.text}`);
  const install = page.locator(`${CARDS} [data-part="home-card"][data-variant="install"]`);
  assert((await install.getByRole("link", { name: /Add Lexicommons to your Home Screen/ }).count()) === 1, "the install card's link");
  assert((await install.getByRole("button", { name: "Not now" }).count()) === 1, "Not now");
  await install.scrollIntoViewIfNeeded();
  await shot("01-notices");
});

await stage("no book yet: Read's own book, opening onto the shelf, the card opening Read", async () => {
  const items = await list();
  const book = items.find((one) => one.card === "book");
  assert(book.href === "#read", `the card goes to ${book.href}`);
  assert(!items.some((one) => one.head === "Reading"), "a Reading heading with no book");
  const inside = await page.locator(`${CARDS} [data-variant="book"] .lx-hb-inside`).textContent();
  assert(/\d/.test(inside), `the shelf's count on the lit page: ${inside}`);
});

await stage("your AI waiting on you: under its own heading, its line drawn, your bubble empty: Your turn", async () => {
  const card = page.locator(`${CARDS} [data-part="home-card"][data-variant="ai"]`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const turn = await card.locator('.lx-hc-bubble[data-who="turn"]').textContent();
  assert(turn.trim() === "Your turn", `the empty bubble: ${turn}`);
  assert((await card.locator('.lx-hc-bubble[data-who="ai"]').textContent()).includes("Wat ga je dit weekend doen?"), "its line");
  await shot("02-your-turn");
});

// ---------- a book you're reading, and your answer ----------
await keepPractice(true);
// The book from Find a book by its title (Read's leading shelf has only its first shelf's covers; the rest are rows to their pages).
await page.evaluate((q) => (location.hash = `#read/find?${new URLSearchParams({ q })}`), BOOK);
const row = page.locator('[data-part="page"]:not([data-ghost]) [data-book] [data-part="list-row"]', { hasText: BOOK }).first();
await row.waitFor({ timeout: 30_000 });
await row.scrollIntoViewIfNeeded();
await row.tap();
await page.waitForSelector('[data-part="reader"]', { timeout: 60_000 });
await page.waitForTimeout(1500);
for (let i = 0; i < 4; i++) {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(450);
}
await page.waitForTimeout(1200);
await page.reload();
await page.waitForSelector("html[data-app-ready]");
await home();

await stage("reading: a Reading heading whose All books opens Read, then the book; no border, its teal tile with a hard edge, its name on the cover", async () => {
  const items = await list();
  const shape = items.map((one) => one.head ?? one.card).join(" · ");
  assert(shape === "paused · install · Reading · book · Your AI · ai", `order: ${shape}`);
  const head = items.find((one) => one.head === "Reading");
  assert(head.link?.href === "#read" && head.link.text === "All books", `Reading's link: ${JSON.stringify(head.link)}`);
  const book = items.find((one) => one.card === "book");
  assert(/^#read\/book\//.test(book.href), `the card goes to ${book.href}`);
  assert(book.border === 0 && book.edge === "none", `the book card has a border (${book.border}) or an edge of its own (${book.edge})`);
  const look = await page.evaluate((cards) => {
    const card = document.querySelector(`${cards} [data-variant="book"]`);
    const tile = card.querySelector(".lx-hb-tile");
    return {
      tile: getComputedStyle(tile).boxShadow,
      teal: getComputedStyle(tile).backgroundColor,
      cover: card.querySelector(".lx-hb-cover-title").textContent,
      title: card.querySelector(".lx-hc-title").textContent,
      lines: card.querySelectorAll(".lx-hc-sub").length,
      rows: card.querySelectorAll("a").length,
    };
  }, CARDS);
  assert(/4px/.test(look.tile), `the tile's hard edge: ${look.tile}`);
  assert(look.title.toLowerCase().includes(BOOK.toLowerCase()), `the title: ${look.title}`);
  assert(look.cover === look.title.split(/:\s/u)[0], `the cover: ${look.cover} (title ${look.title})`);
  assert(look.lines === 1 && look.rows === 0, `${look.lines} lines under the title, ${look.rows} links inside the card`);
  return look.cover;
});

const openNow = () => page.evaluate((cards) => getComputedStyle(document.querySelector(`${cards} .lx-hb-book`)).getPropertyValue("--open").trim(), CARDS);
const bookTopTo = (top) =>
  page.evaluate(
    ({ cards, top }) => {
      const book = document.querySelector(`${cards} .lx-hb-book`);
      book.closest('[data-part="page"]').scrollTop += book.getBoundingClientRect().top - top;
    },
    { cards: CARDS, top },
  );

await stage("the book shut as it comes up the screen, open once its top is a quarter of the way down, shut again on the way back", async () => {
  const { foot, height, vh } = await page.evaluate((cards) => {
    const bar = document.querySelector('[data-part="tab-bar"]')?.getBoundingClientRect();
    return { foot: bar?.height && bar.top > innerHeight / 2 ? bar.top : innerHeight, height: document.querySelector(`${cards} .lx-hb-book`).getBoundingClientRect().height, vh: innerHeight };
  }, CARDS);
  await bookTopTo(foot - 24 - height + 4);
  await page.waitForTimeout(400);
  const shut = Number(await openNow());
  await shot("03-book-shut");
  await bookTopTo(vh * 0.2);
  await page.waitForTimeout(400);
  const open = Number(await openNow());
  await shot("04-book-open");
  await bookTopTo(foot - 24 - height + 4);
  await page.waitForTimeout(400);
  const again = Number(await openNow());
  assert(shut === 0 && open === 1 && again === 0, `shut ${shut}, open ${open}, back ${again}`);
});

await stage("your AI answered: no border, the exchange on its sun tile, Tinta on its floor clear of both lines", async () => {
  const card = page.locator(`${CARDS} [data-part="home-card"][data-variant="ai"]`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000);
  const look = await page.evaluate((cards) => {
    const card = document.querySelector(`${cards} [data-variant="ai"]`);
    const box = (node) => node && (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(node.getBoundingClientRect());
    const style = getComputedStyle(card);
    const head = card.previousElementSibling;
    return {
      head: head?.matches(".lx-hc-head") ? head.textContent.trim() : null,
      border: parseFloat(style.borderTopWidth),
      edge: getComputedStyle(card.querySelector(".lx-hc-scene")).boxShadow,
      ai: box(card.querySelector('.lx-hc-bubble[data-who="ai"]')),
      you: box(card.querySelector('.lx-hc-bubble[data-who="you"]')),
      you_text: card.querySelector('.lx-hc-bubble[data-who="you"]')?.textContent,
      tinta: box(card.querySelector(".lx-hc-floor > .lx-hc-perch > svg") ?? card.querySelector(".lx-hc-floor > .lx-hc-perch")),
      scene: box(card.querySelector(".lx-hc-scene")),
    };
  }, CARDS);
  await shot("05-your-ai");
  assert(look.head === "Your AI", `the heading over it: ${look.head}`);
  assert(look.border === 0 && /4px/.test(look.edge), `border ${look.border}, the tile's edge ${look.edge}`);
  assert(look.you_text?.includes("Ik ga met mijn zus fietsen."), `your answer: ${look.you_text}`);
  const meet = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  assert(look.tinta && !meet(look.tinta, look.ai) && !meet(look.tinta, look.you), `Tinta meets a line: ${JSON.stringify(look)}`);
  assert(look.tinta.top >= look.scene.top && look.tinta.bottom <= look.scene.bottom + 1, `Tinta off its tile: ${JSON.stringify(look)}`);
});

await stage("a tap on the AI card's Tinta's ink is a poke, his alone: the card neither opens nor looks pressed; back beside your answer after; a tap in his box beside his drop is the card's: it sinks while it's down and opens", async () => {
  const sel = `${CARDS} [data-part="home-card"][data-variant="ai"] .lx-hc-perch`;
  const scene = `${CARDS} [data-part="home-card"][data-variant="ai"] .lx-hc-scene`;
  await page.locator(sel).scrollIntoViewIfNeeded();
  // His read of the line plays once the card is seen: a poke is from beside, once it's done.
  await page.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-state") === "beside", sel, { timeout: 15_000 });
  // On his ink (character.js inkAt, his body as drawn): his middle across, 60% down, or the nearest point in along that row.
  const at = await page.evaluate((s) => {
    const t = document.querySelector(s), b = t.getBoundingClientRect(), y = b.top + b.height * 0.6, mid = b.left + b.width / 2;
    for (let d = 0; d < b.width / 2; d++) for (const x of [mid - d, mid + d]) if (t.inkAt(x, y, 0)) return [x, y];
    return null;
  }, sel);
  assert(at, "a point on his ink");
  const hit = await page.evaluate(([s, x, y]) => {
    const t = document.querySelector(s);
    return { pokeable: t.hasAttribute("data-pokeable"), his: document.elementFromPoint(x, y) === t };
  }, [sel, ...at]);
  assert(hit.pokeable && hit.his, `a tap on his ink is his: ${JSON.stringify(hit)}`);
  const sunk = () => page.evaluate((s) => getComputedStyle(document.querySelector(s)).transform, scene);
  // The control: held down on the card away from him (a mouse, so it's held), the tile sinks as a pressed card does; let go off the card,
  // so nothing opens.
  const ai = await page.locator(`${CARDS} [data-variant="ai"] .lx-hc-bubble[data-who="ai"]`).boundingBox();
  await page.mouse.move(ai.x + 12, ai.y + 12);
  await page.mouse.down();
  const pressed = await sunk();
  await page.mouse.move(4, 4);
  await page.mouse.up();
  assert(pressed !== "none", `control: held on the card, its tile should sink: ${pressed}`);
  // Held down on him: the tile stays where it is.
  await page.mouse.move(...at);
  await page.mouse.down();
  const onHim = await sunk();
  await page.mouse.up();
  assert(onHim === "none", `held down on him, the card shouldn't look pressed: the tile's transform ${onHim}`);
  await page.waitForFunction((s) => document.querySelector(s).getAttribute("data-state") === "beside", sel, { timeout: 8000 });
  // A tap: a poke, and nothing opens.
  const before = await page.evaluate((s) => {
    const t = document.querySelector(s);
    if (!t.lxClicks) {
      t.lxClicks = { n: 0 };
      t.addEventListener("click", () => t.lxClicks.n++);
    }
    return t.lxClicks.n;
  }, sel);
  await page.touchscreen.tap(...at);
  await page.waitForFunction(([s, n]) => document.querySelector(s)?.lxClicks.n > n, [sel, before], { timeout: 2000 });
  const now = await page.evaluate((s) => ({ state: document.querySelector(s).getAttribute("data-state"), hash: location.hash }), sel);
  assert(now.state === "poke" && now.hash === "#today", `a tap on him pokes him and opens nothing: ${JSON.stringify(now)}`);
  await page.waitForFunction((s) => document.querySelector(s).getAttribute("data-state") === "beside", sel, { timeout: 8000 });
  // Beside his drop, in his box (10 px and more from his ink): not his. Held, the tile sinks as the card's own press does and he isn't
  // poked; let go, the card opens.
  const off = await page.evaluate((s) => {
    const t = document.querySelector(s), b = t.getBoundingClientRect();
    for (let y = b.bottom - 3; y > b.top + 2; y -= 2) for (let x = b.left + 3; x < b.right - 2; x += 2) if (!t.inkAt(x, y, 10) && document.elementFromPoint(x, y) === t) return [x, y];
    return null;
  }, sel);
  assert(off, "a point in his box beside his ink");
  const href = await page.evaluate((s) => document.querySelector(s).closest("a").getAttribute("href"), sel);
  await page.mouse.move(...off);
  await page.mouse.down();
  const besideHim = await sunk();
  const poking = await page.evaluate((s) => ({ poking: document.querySelector(s).hasAttribute("data-poking"), state: document.querySelector(s).getAttribute("data-state") }), sel);
  await page.mouse.up();
  await page.waitForFunction((h) => location.hash === h, href, { timeout: 5000 }).catch(() => {});
  const opened = await page.evaluate(() => location.hash);
  assert(besideHim !== "none" && !poking.poking && poking.state !== "poke", `held beside his drop, the card looks pressed and he isn't poked: ${besideHim} ${JSON.stringify(poking)}`);
  assert(opened === href, `let go beside his drop, the card opens: ${opened}, its href ${href}`);
  return `held on the card ${pressed}, on him ${onHim}, beside his drop ${besideHim}; a tap on him a poke on #today, then beside again; beside him the card opened ${opened}`;
});

await stage("320 wide: every card's title and the book's cover whole, never cut", async () => {
  await page.setViewportSize({ width: 320, height: 693 });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await home();
  const cut = await page.evaluate((cards) =>
    [...document.querySelectorAll(`${cards} :is(.lx-hc-title, .lx-hb-cover-title)`)]
      .filter((node) => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)
      .map((node) => node.textContent),
  CARDS);
  await shot("06-320");
  assert(!cut.length, `cut: ${cut.join(" | ")}`);
});

await stage("Not now: the install card's cross takes it away", async () => {
  const install = page.locator(`${CARDS} [data-part="home-card"][data-variant="install"]`);
  await install.scrollIntoViewIfNeeded();
  await install.getByRole("button", { name: "Not now" }).click();
  await page.waitForFunction((cards) => !document.querySelector(`${cards} [data-variant="install"]`), CARDS, { timeout: 5000 });
});

await stage("animations off: the book simply open", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await home();
  await page.locator(`${CARDS} .lx-hb-book`).scrollIntoViewIfNeeded();
  await bookTopTo(700);
  await page.waitForTimeout(300);
  const open = await openNow();
  assert(open === "1", `--open ${open}`);
});

await context.close();
await browser.close();
const failed = results.filter((r) => !r.ok);
if (problems.length) console.log(`problems:\n  ${problems.join("\n  ")}`);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, problems }, null, 1));
console.log(`${results.length - failed.length}/${results.length} stages passed${problems.length ? `, ${problems.length} page errors` : ""}`);
process.exit(failed.length || problems.length ? 1 : 0);
