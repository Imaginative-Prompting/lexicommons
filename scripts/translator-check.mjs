// The full translator on a phone, as a new account (translate/translator.js, model-worker.js, page.js's last line,
// Settings → Translate): a word-by-word answer offers it with its real size; Not now puts it away on this device, a
// reload too; Stop during a download goes back to the offer, never remembered as Not now; a file that isn't the one
// models.js lists is refused and never kept, and Retry brings it; once here, the best guess is its answer both ways,
// and offline too; Settings → Translate lists the language with what it takes and Remove; Remove takes every file and
// the offer comes back; Settings downloading in place (Stop, and carried to done). Pictures of each state at 390, in
// Graphite and Paper, for the people who own those screens.
// LOCAL only: the server's library needs the translator's files (scripts/translate/models-r2.mjs --from … --local <dir>).
//   node scripts/translator-check.mjs http://localhost:<port> <outDir> [--packs]   (through gpu.py's parallel lane)
// --packs: the server has default packs (path-nl, the word bands), so a new account's are still coming on a slowed
// connection, and the stage about them must run; without it, a server with none says that stage was skipped.

const { chromium } = await import("./quiet-browser.mjs");
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { CACHE, LANGUAGES_WITH, RUNTIME, filesOf } from "../public/js/translate/models.js";

const [BASE, outArg] = process.argv.slice(2);
// --packs: the server has default packs (a new account's download of them is what one stage needs; without them it says
// it was skipped, with this it fails).
const PACKS = process.argv.includes("--packs");
if (!BASE || !outArg || !/^http:\/\/localhost/.test(BASE)) {
  console.error("usage: translator-check.mjs http://localhost:<port> <outDir> (LOCAL only)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const stage = async (name, run) => {
  try {
    const said = await run();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).slice(0, 400)}`);
  }
};

const FIELD = '[data-part="translate-field"] :is(textarea, input)';
const LINE = ".lx-tr-model";
const LIMITED = "De oude molenaar fietst langzaam langs de bevroren sloot."; // nothing a starter pack says whole
const FILES = [RUNTIME.wasm, ...filesOf("nl")];
const SIZE = Math.round(FILES.reduce((sum, file) => sum + file.size, 0) / 1e6);

// The translator's files slowed where its worker fetches them. A CDP throttle on the page never reaches the worker (it once
// let 36→74 MB through in under 4 s, so what a stage saw depended on timing); context.route does. Each file is sent on to a
// server in this check, which fetches it from BASE and passes it on in small pieces at `rate` bytes a second, so the
// download's progress comes steadily (a fulfilled route would hand the worker each file whole, at once).
let slowRate = 0;
const slowServer = createServer(async (req, res) => {
  const file = FILES.find((f) => f.url === req.url);
  const upstream = file && (await fetch(`${BASE}${file.url}`).catch(() => null));
  if (!upstream?.ok) return res.writeHead(upstream?.status ?? 404).end();
  res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": upstream.headers.get("content-length") ?? file.size, "Cache-Control": "no-store" });
  const PIECE = 16_384;
  try {
    for await (const chunk of upstream.body) {
      for (let at = 0; at < chunk.length; at += PIECE) {
        if (res.destroyed) return;
        res.write(chunk.subarray(at, at + PIECE));
        await new Promise((done) => setTimeout(done, (PIECE / slowRate) * 1000));
      }
    }
    res.end();
  } catch {
    res.destroy();
  }
});
const slowFiles = async (rate) => {
  slowRate = rate;
  if (!slowServer.listening) await new Promise((done) => slowServer.listen(0, "127.0.0.1", done));
  const { port } = slowServer.address();
  for (const file of FILES) await context.route(`**${file.url}`, (route) => route.continue({ url: `http://127.0.0.1:${port}${file.url}` }));
};
const unslowFiles = async () => {
  for (const file of FILES) await context.unroute(`**${file.url}`);
};

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
// The translator failing to answer (translator.js logs "[translator]" when a way won't load or translate).
const translatorErrors = [];
page.on("console", (message) => message.type() === "error" && message.text().includes("[translator]") && translatorErrors.push(message.text()));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Translator Check");
await page.click('#register button[type="submit"]');
await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });

const home = async () => {
  await page.goto("about:blank");
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.waitForSelector(FIELD, { timeout: 30_000 });
  // Until the translator has looked in Cache Storage (polled here: a promise handed to waitForFunction is truthy at once).
  await waitFor("the translator's look at this device", 15_000, () => page.evaluate(() => import("/js/translate/translator.js").then((m) => m.translatorChecked())));
  await page.waitForTimeout(400);
};
const stateNow = () => page.evaluate(() => import("/js/translate/translator.js").then((m) => m.translatorState("nl", "en").state));
const typeIn = async (text) => {
  await page.locator(FIELD).first().tap({ position: { x: 24, y: 20 } });
  await page.locator(FIELD).first().fill(text);
  await page.waitForTimeout(1600);
};
const fieldSays = () => page.evaluate(() => document.querySelector('[data-part="translate-field"] .lx-tr-lang')?.innerText?.trim() ?? "");
const lineText = () => page.evaluate((s) => document.querySelector(s)?.innerText?.trim() ?? "", LINE);
// The app's look is its theme, not the device's setting: Graphite (the default) and Paper, the page's own theme switched
// for the picture and put back (as failure-check's --theme does).
const shot = async (name) => {
  const was = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.screenshot({ path: join(OUT, "shots", `${name}-${was}.png`) });
  await page.evaluate(() => (document.documentElement.dataset.theme = "paper"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "shots", `${name}-paper.png`) });
  await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), was);
  await page.waitForTimeout(100);
};
const kept = () => page.evaluate(async ([cache, urls]) => {
  const c = await caches.open(cache);
  const out = [];
  for (const url of urls) if (await c.match(url)) out.push(url);
  return out;
}, [CACHE, FILES.map((f) => f.url)]);
const best = () => page.evaluate(() => document.querySelector(".lx-today-translate .lx-tr-meaning, .lx-today-translate .lx-tr-said")?.closest("[class]")?.parentElement?.innerText?.trim() ?? "");
const waitFor = async (what, ms, test) => {
  for (let waited = 0; waited < ms; waited += 250) {
    if (await test()) return true;
    await page.waitForTimeout(250);
  }
  const name = what.replace(/\W+/g, "-");
  await page.screenshot({ path: join(OUT, "shots", `missed-${name}.png`) }).catch(() => {});
  const shown = await page.evaluate(() => document.querySelector(".lx-today-translate")?.innerText?.slice(0, 300) ?? "");
  throw new Error(`${what} didn't come in ${ms / 1000} s; the page showed: ${JSON.stringify(shown)}`);
};

// At 320 × 640 the translator's line, last in the foot, ends clear of the floating bar (lex-design-2, 5 Nov). The phone put
// back before anything's asserted.
const clearOfBarAt320 = async (name) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(500);
  const gap = await page.evaluate(() => {
    const bar = document.querySelector(".lx-way-bar");
    const line = document.querySelector(".lx-tr-model");
    return bar && line?.firstChild ? bar.getBoundingClientRect().top - line.getBoundingClientRect().bottom : null;
  });
  await page.screenshot({ path: join(OUT, "shots", `${name}-320-graphite.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert(gap !== null && gap >= 0, `at 320 × 640 the line ${gap === null ? "isn't there" : `runs ${(-gap).toFixed(1)} px under the bar`}`);
};
// The downloading line: words at the start and Stop at the end of one row, the plain bar under it.
const downloadingLine = () =>
  page.evaluate(() => {
    const line = document.querySelector(".lx-tr-model");
    const words = line?.querySelector(".lx-tr-model-row > p")?.getBoundingClientRect();
    const stop = line?.querySelector(".lx-tr-model-row > button")?.getBoundingClientRect();
    const bar = line?.querySelector('[data-part="download-bar"]');
    return words && stop && bar
      ? { off: Math.abs((stop.top + stop.bottom) / 2 - (words.top + words.bottom) / 2), atEnd: line.getBoundingClientRect().right - stop.right, under: bar.getBoundingClientRect().top - Math.max(words.bottom, stop.bottom), tinta: Boolean(bar.querySelector('[data-part="character"]')) }
      : null;
  });

await stage(`Dutch has the full translator (models.js), ${SIZE} MB with the runtime`, async () => {
  assert(LANGUAGES_WITH.includes("nl"), `languages: ${LANGUAGES_WITH}`);
  return `${FILES.length} files`;
});

await stage("a limited answer offers the full translator, with the download's real size", async () => {
  await home();
  const typed = Date.now();
  await typeIn(LIMITED);
  // On a server with default packs a new account's packs are still coming here: say so, and how long the offer took.
  const packsComing = () => page.evaluate(() => /Getting the word packs/.test(document.querySelector(".lx-today-translate")?.innerText ?? ""));
  const comingAtFirst = await packsComing();
  await waitFor("the offer", 60_000, async () => (await lineText()).includes(`${SIZE}\u00a0MB`));
  const took = Date.now() - typed;
  const comingAtOffer = await packsComing();
  const said = await lineText();
  assert(await page.locator(`${LINE} button`, { hasText: "Download" }).count() === 1 && (await page.locator(`${LINE} button`, { hasText: "Not now" }).count()) === 1, "Download and Not now");
  const foot = await page.evaluate((s) => { const line = document.querySelector(s); return line?.parentElement?.lastElementChild === line; }, LINE);
  assert(foot, "it isn't last in the foot");
  await shot("01-offer");
  return `${said.split("\n")[0]} (${took} ms after typing; the word packs ${comingAtFirst ? (comingAtOffer ? "still coming when it showed" : "coming at first, here by the time it showed") : "not coming"})`;
});

await stage("Not now puts it away, and a reload keeps it away", async () => {
  await page.locator(`${LINE} button`, { hasText: "Not now" }).tap();
  await page.waitForTimeout(300);
  assert((await lineText()) === "", `still: "${await lineText()}"`);
  await home();
  await typeIn(LIMITED);
  assert((await stateNow()) === "declined", `after a reload it's ${await stateNow()}`);
  assert((await lineText()) === "", `after a reload: "${await lineText()}"`);
  await page.evaluate(() => localStorage.removeItem("lx.translator.declined.v1"));
});

await stage("Stop during the download goes back to the offer, not remembered as Not now", async () => {
  await home();
  await typeIn(LIMITED);
  await slowFiles(2_000_000);
  // What the downloading line looks like, gathered while it downloads; Stop pressed and the network put back whatever
  // happened, so a miss here never leaves a download running into the stages after it.
  let line = null;
  let at320 = null;
  try {
    await page.locator(`${LINE} button`, { hasText: "Download" }).tap();
    await waitFor("the download's line", 10_000, async () => (await lineText()).includes("Full translator coming"));
    await page.waitForTimeout(1500);
    await shot("02-downloading");
    line = await downloadingLine();
    at320 = await clearOfBarAt320("02-downloading").then(() => null, (error) => error);
  } finally {
    if (await page.locator(`${LINE} button`, { hasText: "Stop" }).count()) await page.locator(`${LINE} button`, { hasText: "Stop" }).tap();
    await unslowFiles();
  }
  await waitFor("the offer, back", 15_000, async () => (await lineText()).includes("\u00a0MB download"));
  assert(line, "the downloading line hasn't its words, Stop and bar");
  assert(!line.tinta, "Tinta is on the page's bar (the plain bar there)");
  assert(line.off <= 2 && line.atEnd <= 1, `Stop isn't at the end of the words' row (${line.off.toFixed(1)} px off their middle, ${line.atEnd.toFixed(1)} px from the end)`);
  assert(line.under >= 0, `the bar overlaps the row by ${(-line.under).toFixed(1)} px`);
  if (at320) throw at320;
  const declined = await page.evaluate(() => localStorage.getItem("lx.translator.declined.v1"));
  assert(!declined || !declined.includes("nl"), `remembered as Not now: ${declined}`);
});

await stage("PLANT a file that isn't the listed one: refused, never kept, and Retry brings it", async () => {
  const vocab = filesOf("nl").find((f) => f.name.endsWith(".spm"));
  await context.route(`**${vocab.url}`, (route) => route.fulfill({ status: 200, contentType: "application/octet-stream", body: Buffer.from("not the vocabulary at all") }));
  await page.locator(`${LINE} button`, { hasText: "Download" }).tap();
  await waitFor("the failure", 60_000, async () => (await lineText()).includes("didn't download"));
  const here = await kept();
  assert(!here.includes(vocab.url), "the wrong file was kept");
  await shot("03-failed");
  await clearOfBarAt320("03-failed");
  await context.unroute(`**${vocab.url}`);
  await page.locator(`${LINE} button`, { hasText: "Retry" }).tap();
  await waitFor("the translator, here", 120_000, async () => (await lineText()).includes("is here"));
  // What was typed while it came is answered once it's here (the packs have none of it), and from Dutch.
  await waitFor("its answer to what's typed", 20_000, async () => { const said = await best(); return Boolean(said) && !/molenaar/i.test(said); });
  assert(/Dutch/.test(await fieldSays()), `the field says it's "${await fieldSays()}"`);
  await shot("04-here");
  const all = await kept();
  assert(all.length === FILES.length, `${all.length} of ${FILES.length} files kept`);
  return `${all.length} files kept`;
});

// Every best guess the page shows, as it shows it (a MutationObserver, so one drawn for a frame counts too).
const watchBest = () =>
  page.evaluate(() => {
    window.__bestSeen = [];
    window.__bestWatch?.disconnect();
    const read = () => {
      const shown = document.querySelector(".lx-today-translate .lx-tr-meaning, .lx-today-translate .lx-tr-said")?.closest("[class]")?.parentElement?.innerText?.trim();
      if (shown) window.__bestSeen.push(shown);
    };
    window.__bestWatch = new MutationObserver(read);
    window.__bestWatch.observe(document.querySelector(".lx-today-translate"), { subtree: true, childList: true, characterData: true });
  });
const bestSeen = () => page.evaluate(() => (window.__bestWatch?.disconnect(), window.__bestSeen ?? []));

// The starter alone (all this account has; the local server has no packs) finds no word of either sentence, so nothing in
// the packs says which way they go: the translator does, asked both ways, and no answer the wrong way shows first
// (from English, "Mijn zus heeft een hond." comes back as "Mijn zus heeft hond.").
// A cleared field, nothing shown under it, before the watcher starts: so it sees only what answers the next sentence.
const cleared = async () => {
  await page.locator(FIELD).first().fill("");
  await waitFor("the page, cleared", 10_000, async () => (await best()) === "");
};
await stage("the best guess is the translator's both ways, which way said by the translator where the packs can't, never an answer the wrong way first", async () => {
  await cleared();
  await watchBest();
  await typeIn("Mijn zus heeft een hond.");
  await waitFor("its answer from Dutch", 20_000, async () => /sister/i.test(await best()));
  const toEnglish = await best();
  const wrongFromDutch = (await bestSeen()).filter((shown) => /\bhond\b/i.test(shown) && !/sister/i.test(shown));
  assert(!wrongFromDutch.length, `an answer the wrong way showed first: ${JSON.stringify(wrongFromDutch[0])}`);
  assert(/Dutch/.test(await fieldSays()), `the field says it's "${await fieldSays()}"`);
  await cleared();
  await watchBest();
  await typeIn("My sister has a dog.");
  await waitFor("its answer from English", 20_000, async () => /zus/i.test(await best()));
  const wrongFromEnglish = (await bestSeen()).filter((shown) => /\bsister\b/i.test(shown) && !/zus/i.test(shown));
  assert(!wrongFromEnglish.length, `an answer the wrong way showed first: ${JSON.stringify(wrongFromEnglish[0])}`);
  assert(/English/.test(await fieldSays()), `the field says it's "${await fieldSays()}"`);
  return `${JSON.stringify(toEnglish.split("\n")[0])}, ${JSON.stringify((await best()).split("\n")[0])}`;
});

await stage("offline, it still answers", async () => {
  await context.setOffline(true);
  await typeIn("Het regent vandaag in de stad.");
  await waitFor("its answer offline", 20_000, async () => /rain/i.test(await best()));
  const answer = await best();
  await context.setOffline(false);
  return JSON.stringify(answer.split("\n")[0]);
});

// Wi-Fi with no internet: the browser says it's online, and the server never answers (its request held until the stage
// ends). What the translator on this device can say comes at once, not after the server's 20 s.
await stage("online with no internet (the server never answers): the translator's answer at once, not after the server's wait", async () => {
  const api = "**/api/translate";
  let release = () => {};
  const held = new Promise((done) => (release = done));
  await context.route(api, async (route) => {
    await held;
    await route.abort().catch(() => {});
  });
  try {
    await home();
    const at = Date.now();
    await typeIn("Gisteravond regende het hevig."); // no word of it in the starter packs: nothing found here
    await waitFor("the translator's answer, the server still out", 5_000, async () => /rain/i.test(await best()));
    return `"${(await best()).split("\n")[0]}" ${Date.now() - at} ms after typing, the server still out`;
  } finally {
    release();
    await context.unroute(api);
  }
});

// Typing with the translator here (the owner's walkthrough, 6 Nov: "every letter it flickers between things"): once it has
// answered, a phrase typed a letter at a time, every frame sampled. No frame may lose the answer, show "Looking it up…" or
// "Not found yet", or show anything but the translator's answer; and while the keys come faster than its pause, the answer
// on screen doesn't change with each letter. It changes once typing stops.
await stage("typing with the translator: no frame loses the answer or flips between states; it changes once typing pauses", async () => {
  await home();
  await typeIn("Het regent");
  await waitFor("the translator's first answer", 15_000, async () => /rain/i.test(await best()));
  const sample = () =>
    page.evaluate(() => {
      window.__frames = [];
      const read = () => {
        const box = document.querySelector(".lx-tr-results");
        const bestNode = box?.querySelector('[data-part="translate-result"][data-state="best"]');
        window.__frames.push({
          at: Math.round(performance.now()),
          best: bestNode?.innerText.trim().split("\n")[0] ?? null,
          looking: Boolean(document.querySelector('.lx-today-translate [data-part="looking-up"]')),
          none: Boolean(box?.querySelector(".lx-tr-none")),
          empty: !box || !box.children.length,
        });
        if (window.__framing) requestAnimationFrame(read);
      };
      window.__framing = true;
      requestAnimationFrame(read);
    });
  await sample();
  // A key every 120 ms: faster than the translator's pause, as a person types.
  await page.locator(FIELD).first().pressSequentially(" vandaag in de stad", { delay: 120 });
  const typedAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(2500);
  const frames = await page.evaluate(() => ((window.__framing = false), window.__frames));
  const bad = frames.filter((f) => f.empty || f.looking || f.none || !f.best);
  assert(!bad.length, `${bad.length} of ${frames.length} frames without the answer (first: ${JSON.stringify(bad[0])})`);
  const whileTyping = frames.filter((f) => f.at < typedAt);
  const changes = whileTyping.filter((f, i) => i && f.best !== whileTyping[i - 1].best).length;
  assert(changes <= 1, `the answer changed ${changes} times while the letters came: ${[...new Set(whileTyping.map((f) => f.best))].join(" | ")}`);
  const last = frames[frames.length - 1].best;
  assert(/rain/i.test(last) && /today|city/i.test(last), `after typing stopped: "${last}"`);
  return `${frames.length} frames, every one with the answer; ${changes} change(s) while typing; then "${last}"`;
});

await stage("offline, Swap follows the translator's detected direction when the packs can't tell", async () => {
  if (PACKS) return "skipped: with --packs the word packs say which way";
  await home();
  assert((await stateNow()) === "ready", "the Dutch translator isn't on the device");
  // Its worker started while online: this check blocks the service worker, whose copy of the worker's script a phone has
  // offline, so a worker first started offline here can't load (and says the translator didn't start).
  await typeIn("Het regent");
  await waitFor("the translator, started online", 15_000, async () => /rain/i.test(await best()));
  await context.setOffline(true);
  try {
    const packs = await page.evaluate(async () => {
      const { translate } = await import("/js/translate/translate.js");
      const found = await translate("My sister has a dog.", { language: "nl" });
      return { from: found.from, whole: Boolean(found.whole), words: found.words.length };
    });
    assert(packs.from === "nl" && !packs.whole && packs.words === 0, `the starter packs didn't tie at Dutch: ${JSON.stringify(packs)}`);
    await typeIn("My sister has a dog.");
    await waitFor("its Dutch answer before Swap", 20_000, async () => /zus/i.test(await best()));
    assert(/English/.test(await fieldSays()), `before Swap the field says "${await fieldSays()}"`);
    const answer = await page.locator('.lx-today-translate .lx-tr-said').first().innerText();
    assert(/zus/i.test(answer) && !/sister/i.test(answer), `not the Dutch answer: ${JSON.stringify(answer)}`);
    // The packs tie at Dutch; the translator has shown English. Before the fix Swap used the packs and stayed English → Dutch.
    await page.locator('[data-part="translate-field"] .lx-tr-swap').tap();
    assert((await page.locator(FIELD).first().inputValue()) === answer, `Swap didn't move the Dutch answer into the field: ${await page.locator(FIELD).first().inputValue()}`);
    assert(/Dutch/.test(await fieldSays()), `after Swap the field says "${await fieldSays()}"`);
    assert((await page.locator(FIELD).first().getAttribute("aria-label")) === "Translate from Dutch to English", "Swap didn't choose Dutch → English");
    await waitFor("its English answer after Swap", 20_000, async () => /sister/i.test(await best()));
    assert((await page.locator(`${LINE} button`, { hasText: "Download" }).count()) === 0, "Swap offered a translator already on the device");
    return JSON.stringify(answer);
  } finally {
    await context.setOffline(false);
    await home();
  }
});

const settingsText = () => page.evaluate(() => (document.querySelector('[data-part="page"]') ?? document.body).innerText);
// The language's row (lex-design-3, 5 Nov): its title and sub, its trailing button (if any) against the text, the part
// under it (the bar's track) against the row's inner width, and the group's note under it all.
const rowNow = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('[data-part="list-row"]')].find((r) => r.querySelector(".lx-row-title")?.textContent.includes("↔"));
    if (!row) return null;
    const box = (node) => node?.getBoundingClientRect() ?? null;
    const text = box(row.querySelector(".lx-row-text"));
    // Its own button (Remove, Stop), or the page's one way forward, solid, under it (Download, Retry: lex-design-2, 6 Nov).
    const own = row.querySelector(":scope > button");
    const solid = own ? null : row.closest("li")?.nextElementSibling?.matches?.("li.lx-row-go") ? row.closest("li").nextElementSibling.querySelector("button") : null;
    const button = own ?? solid;
    const track = box(row.querySelector(":scope > .lx-row-below .lx-download-track"));
    const style = getComputedStyle(row);
    const inner = row.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const probe = document.body.appendChild(Object.assign(document.createElement("div"), { style: "position:absolute;height:var(--space-3)" }));
    const space3 = probe.getBoundingClientRect().height;
    probe.remove();
    // What follows the group: its note, or the About row after it.
    const note = box(row.closest(".lx-group")?.querySelector('[data-part="group-note"]') ?? row.closest(".lx-group")?.nextElementSibling);
    return {
      title: row.querySelector(".lx-row-title").textContent,
      sub: row.querySelector(".lx-row-sub")?.textContent ?? "",
      button: button?.textContent.trim() ?? null,
      off: own && text ? Math.abs((box(own).top + box(own).bottom) / 2 - (text.top + text.bottom) / 2) : null,
      solid: Boolean(solid),
      track: track && { below: track.top - text.bottom, short: inner - track.width, toNote: note ? note.top - track.bottom : null, space3 },
      done: Boolean(row.querySelector('[data-part="download-bar"][data-state="done"]')),
    };
  });
const PAIR = "Dutch ↔ English";
const rowSays = (row, sub, button) => {
  assert(row, "no row for the language");
  assert(row.title === PAIR, `the title is "${row.title}"`);
  assert(sub.test(row.sub), `the sub is "${row.sub}"`);
  assert(row.button === button, `its button is ${JSON.stringify(row.button)}`);
  if (button && !row.solid) assert(row.off <= 2, `${button} is ${row.off?.toFixed(1)} px off the text's middle`);
};
// A row's own button (Remove, Stop), or the page's one way forward under its row (Download, Retry).
const pressRow = (words) => page.locator('[data-part="list-row"] > button, li.lx-row-go > button', { hasText: words }).first().tap();
// A row's button that has settled: the same element for half a second, as a person's next press finds it (on a busy machine a
// press the moment a row came back after Stop was lost).
const settledButton = (words) =>
  page.evaluate(async (words) => {
    const t0 = performance.now();
    let last = null;
    let since = t0;
    while (performance.now() - t0 < 5_000) {
      const now = [...document.querySelectorAll('[data-part="list-row"] > button, li.lx-row-go > button')].find((b) => b.textContent.includes(words)) ?? null;
      if (now !== last) [last, since] = [now, performance.now()];
      else if (now && performance.now() - since >= 500) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }, words);

await stage("Settings → Translate: one row, the same title, what it takes and Remove centered on its text", async () => {
  await page.goto(`${BASE}/app/#settings/translate`);
  await page.waitForSelector("html[data-app-ready]");
  await waitFor("the row", 10_000, async () => Boolean(await rowNow()));
  rowSays(await rowNow(), new RegExp(`^${SIZE}\u00a0MB on this device · works offline$`), "Remove");
  assert(!/\b(model|AI)\b/.test(await settingsText()), "it says model or AI");
  await shot("05-settings-here");
  await pressRow("Remove");
  await waitFor("its files gone", 10_000, async () => (await kept()).filter((url) => url !== RUNTIME.wasm.url).length === 0);
  await waitFor("the download row", 10_000, async () => (await rowNow())?.button === "Download");
  rowSays(await rowNow(), new RegExp(`^${SIZE}\u00a0MB to download, once$`), "Download");
  await shot("06-settings-empty");
});

await stage("Settings → Translate offline: the row says it needs a connection, with no button, and comes back online", async () => {
  await context.setOffline(true);
  await waitFor("the offline row", 10_000, async () => /Needs a connection/.test((await rowNow())?.sub ?? ""));
  rowSays(await rowNow(), /^Needs a connection to download$/, null);
  await context.setOffline(false);
  await waitFor("the Download button, back", 10_000, async () => (await rowNow())?.button === "Download");
});

// Stop as a person presses it: down on the button, held while the download moves on under it (the row told of its progress
// at least once), then up, well short of a long press. A row built again on each bit of progress hands the press a new
// button halfway, and it's no click: Stop was lost mid-download (v96–v97). A finger on a phone, and a mouse on a computer.
const ticks = () => page.evaluate(() => window.__lxTicks ?? 0);
const holdStop = async (how) => {
  const box = await page.locator('[data-part="list-row"] > button', { hasText: "Stop" }).first().boundingBox();
  assert(box, "no Stop to press");
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.evaluate(() =>
    import("/js/translate/translator.js").then((m) => {
      window.__lxUntick?.();
      window.__lxTicks = 0;
      window.__lxUntick = m.onTranslatorChange(() => window.__lxTicks++);
    }),
  );
  if (how === "finger") await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  else await page.mouse.move(x, y).then(() => page.mouse.down());
  const downAt = Date.now();
  while ((await ticks()) === 0 && Date.now() - downAt < 400) await page.waitForTimeout(20);
  const told = await ticks();
  if (how === "finger") await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else await page.mouse.up();
  const held = Date.now() - downAt;
  await page.evaluate(() => window.__lxUntick?.());
  assert(told > 0, `no progress came in the ${held} ms the ${how} was down, so this press shows nothing`);
  return held;
};

await stage("Settings → Translate downloads in place: how far and Stop by the text, the bar on its own line at the row's width, room before the note; Stop puts the row back, pressed by a finger and by a mouse held while the download moves on under it", async () => {
  await slowFiles(4_000_000);
  try {
    await pressRow("Download");
    await waitFor("Settings' download", 10_000, async () => /carries on if you leave/.test((await rowNow())?.sub ?? ""));
    assert(/#settings\/translate$/.test(page.url()), `it went to ${page.url()}`);
    await page.waitForTimeout(1500);
    await shot("07-settings-downloading");
    const row = await rowNow();
    rowSays(row, new RegExp(`^\\d+ of ${SIZE}\u00a0MB · carries on if you leave$`), "Stop");
    assert(!/%/.test(row.title + row.sub), "how far, said twice");
    assert(row.track, "no bar under the row");
    assert(row.track.below >= 0, `the bar overlaps the text by ${-row.track.below} px`);
    assert(row.track.short <= 1, `the bar stops ${row.track.short.toFixed(1)} px short of the row's width`);
    assert(row.track.toNote >= row.track.space3 - 0.5, `${row.track.toNote?.toFixed(1)} px from the bar to the note (--space-3 is ${row.track.space3})`);
    const finger = await holdStop("finger");
    await waitFor("the download row, back after a finger's Stop", 3_000, async () => (await rowNow())?.button === "Download");
    assert(await settledButton("Download"), "the Download row never settled after the finger's Stop");
    await pressRow("Download");
    await waitFor("Settings' download, again", 20_000, async () => /carries on if you leave/.test((await rowNow())?.sub ?? ""));
    await page.waitForTimeout(500);
    const mouse = await holdStop("mouse");
    await waitFor("the download row, back after a mouse's Stop", 3_000, async () => (await rowNow())?.button === "Download");
    return `Stop held ${finger} ms by a finger and ${mouse} ms by a mouse, the download moving on under each`;
  } finally {
    // Whatever failed above, the download is stopped (by the translator itself: a press may be what failed) and the
    // files put back to full speed, so the next stage starts clean.
    await page.evaluate(() => import("/js/translate/translator.js").then((m) => m.stopTranslator("nl")));
    await unslowFiles();
  }
  await waitFor("the download row, back", 15_000, async () => (await rowNow())?.button === "Download");
});

await stage("Settings → Translate done on its page: the full bar with Tinta out for a beat, then the plain row by itself; a press settles it at once", async () => {
  await pressRow("Download");
  await waitFor("done, on this page", 120_000, async () => Boolean((await rowNow())?.done));
  const doneAt = Date.now();
  await shot("08-settings-downloaded");
  assert((await kept()).length === FILES.length, `${(await kept()).length} of ${FILES.length} files kept`);
  await waitFor("the plain row", 5_000, async () => { const row = await rowNow(); return row && !row.track && row.button === "Remove"; });
  const beat = Date.now() - doneAt;
  assert(beat >= 600 && beat <= 3000, `the beat lasted ${beat} ms`);
  rowSays(await rowNow(), new RegExp(`^${SIZE}\u00a0MB on this device · works offline$`), "Remove");
  // Again, and a press on the page's title while it holds: settled in that press.
  await pressRow("Remove");
  await waitFor("the download row", 10_000, async () => (await rowNow())?.button === "Download");
  await pressRow("Download");
  await waitFor("done again", 120_000, async () => Boolean((await rowNow())?.done));
  await page.locator('[data-part="page-title"], h1').first().tap();
  await page.waitForTimeout(150);
  assert(!(await rowNow())?.track, "a press didn't settle it");
  await pressRow("Remove");
  await waitFor("its files gone", 10_000, async () => (await kept()).filter((url) => url !== RUNTIME.wasm.url).length === 0);
  await waitFor("the download row", 10_000, async () => (await rowNow())?.button === "Download");
  return `the beat ${beat} ms`;
});

await stage("after Remove, Translate offers it again", async () => {
  await home();
  await typeIn(LIMITED);
  await waitFor("the offer, back", 20_000, async () => (await lineText()).includes("\u00a0MB download"));
});

// A translator whose worker can't start (its script failing to load, as a broken deploy or a cache would leave it): the
// download says it didn't, with Retry, never stuck downloading with a Stop that does nothing; Retry, the worker back, brings it.
await stage("a translator that can't start: the download says it didn't, with Retry, never stuck; Retry brings it", async () => {
  const script = "**/js/translate/model-worker.js*";
  await context.route(script, (route) => route.fulfill({ status: 500, contentType: "text/plain", body: "no worker" }));
  try {
    await home();
    await typeIn(LIMITED);
    await waitFor("the offer", 20_000, async () => (await lineText()).includes("\u00a0MB download"));
    await page.locator(`${LINE} button`, { hasText: "Download" }).tap();
    await waitFor("the failure", 20_000, async () => (await lineText()).includes("didn't download"));
    assert(!(await page.locator(`${LINE} button`, { hasText: "Stop" }).count()), "a Stop is still there");
    assert((await stateNow()) === "failed", `its state: ${await stateNow()}`);
  } finally {
    await context.unroute(script);
  }
  await page.locator(`${LINE} button`, { hasText: "Retry" }).tap();
  await waitFor("the translator, here", 120_000, async () => (await lineText()).includes("is here"));
  return "failed and said so; Retry brought it";
});

// A real new account's word packs are still coming when Translate first opens (director, 5 Nov): the offer must not wait for
// them, and a Download pressed meanwhile must wait for them rather than share the connection, say so, and Stop.
await stage("with the word packs still coming: the offer at once under their line; a Download waits for them (no file asked for until they're in), says so, Stop ends the wait, and it starts by itself once they're in", async () => {
  const slow = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
  const p = await slow.newPage();
  p.on("pageerror", (error) => errors.push(error.message));
  // The translator's files asked for, and when: the runtime's and the language's, from the page or its workers (the context
  // sees both). The last part of this stage fails if it never sees one, so "none asked for" can't pass by not looking.
  const asked = [];
  slow.on("request", (request) => /\/library\/translate\/|\/vendor\/bergamot\/bergamot-translator\.wasm/.test(request.url()) && asked.push(Date.now()));
  const c = await slow.newCDPSession(p);
  try {
    await c.send("WebAuthn.enable");
    await c.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    // Slow from the first open (the account's packs start coming then), so they're still coming when Translate opens.
    await c.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: 400_000, uploadThroughput: 200_000 });
    await p.goto(`${BASE}/app/`);
    await p.waitForURL(/\/login\?next=/, { timeout: 60_000 });
    await p.click("summary");
    await p.fill('input[name="name"]', "Translator Packs Check");
    await p.click('#register button[type="submit"]');
    await p.waitForSelector("html[data-app-ready]", { timeout: 90_000 });
    await p.goto("about:blank");
    await p.goto(`${BASE}/app/#today`);
    await p.waitForSelector(FIELD, { timeout: 60_000 });
    await p.locator(FIELD).first().tap({ position: { x: 24, y: 20 } });
    const typed = Date.now();
    await p.locator(FIELD).first().fill(LIMITED);
    const shown = () => p.evaluate((line) => ({ coming: /Getting the word packs/.test(document.querySelector(".lx-today-translate")?.innerText ?? ""), line: document.querySelector(line)?.innerText?.trim() ?? "" }), LINE);
    let now = await shown();
    for (let waited = 0; waited < 8000 && !now.coming; waited += 250) (await p.waitForTimeout(250), (now = await shown()));
    if (!now.coming) {
      assert(!PACKS, "the word packs were never coming here (--packs says they should be)");
      return "skipped: no word packs coming on this server";
    }
    let offerAt = null;
    for (let waited = 0; waited < 6000; waited += 200) {
      now = await shown();
      if (now.line.includes(`${SIZE}\u00a0MB`)) {
        offerAt = Date.now() - typed;
        break;
      }
      await p.waitForTimeout(200);
    }
    assert(offerAt !== null && now.coming, `the offer waited for the packs (${offerAt === null ? "not shown in 6 s" : "shown only once they were in"})`);
    // Download while they come: it waits, says so, asks for nothing; Stop ends the wait.
    await p.locator(`${LINE} button`, { hasText: "Download" }).tap();
    await p.waitForTimeout(600);
    now = await shown();
    assert(/^Full translator next, after the packs\.\s*Stop$/.test(now.line) && now.coming, `while the packs come, the line says "${now.line}"`);
    // One line beside Stop at 390, in the packs' line's quiet ink (lex-design-2, 5 Nov).
    const look = await p.evaluate((line) => {
      const words = document.querySelector(`${line} .lx-tr-model-row > p`);
      const packs = [...document.querySelectorAll(".lx-tr-status p")].find((node) => /Getting the word packs/.test(node.textContent));
      const style = words && getComputedStyle(words);
      const lineHeight = style ? parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3 : 1;
      const lines = words ? Math.round(words.getBoundingClientRect().height / lineHeight) : 0;
      return { lines, ink: words && getComputedStyle(words).color, packsInk: packs && getComputedStyle(packs).color };
    }, LINE);
    assert(look.lines === 1, `the waiting line takes ${look.lines} lines at 390`);
    assert(look.ink && look.ink === look.packsInk, `the waiting line's ink ${look.ink} isn't the packs line's ${look.packsInk}`);
    await p.screenshot({ path: join(OUT, "shots", "09-waiting-for-packs-graphite.png") });
    await p.waitForTimeout(2000);
    assert(!asked.length, `${asked.length} of the translator's files asked for while the packs were coming`);
    await p.locator(`${LINE} button`, { hasText: "Stop" }).tap();
    await p.waitForTimeout(400);
    now = await shown();
    assert(now.line.includes(`${SIZE}\u00a0MB`) && !asked.length, `after Stop: "${now.line}", ${asked.length} files asked for`);
    // Download again, then the packs come in: it starts by itself, after them.
    await p.locator(`${LINE} button`, { hasText: "Download" }).tap();
    await p.waitForTimeout(400);
    assert(/after the packs\./.test((await shown()).line), "the second Download isn't waiting");
    await c.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    let packsInAt = null;
    for (let waited = 0; waited < 90_000; waited += 250) {
      now = await shown();
      if (!now.coming && packsInAt === null) packsInAt = Date.now();
      if (/Full translator coming|is here/.test(now.line)) break;
      await p.waitForTimeout(250);
    }
    assert(/Full translator coming|is here/.test(now.line), `once the packs were in it didn't start: "${now.line}"`);
    for (let waited = 0; waited < 15_000 && !asked.length; waited += 250) await p.waitForTimeout(250);
    assert(asked.length, "the check saw none of the translator's files asked for, even once it started: it can't hold the wait");
    assert(packsInAt !== null, "the packs were never in");
    assert(asked[0] >= packsInAt - 300, `a file was asked for ${packsInAt - asked[0]} ms before the packs were in`);
    if (await p.locator(`${LINE} button`, { hasText: "Stop" }).count()) await p.locator(`${LINE} button`, { hasText: "Stop" }).tap();
    return `the offer ${offerAt} ms after typing, the packs still coming; nothing asked for until they were in`;
  } finally {
    await slow.close();
  }
});

await stage("no page errors", async () => assert(!errors.length, errors.slice(0, 3).join(" | ")));
await stage("the translator never failed to answer", async () => assert(!translatorErrors.length, translatorErrors.slice(0, 3).join(" | ")));
await browser.close();
slowServer.closeAllConnections();
slowServer.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
