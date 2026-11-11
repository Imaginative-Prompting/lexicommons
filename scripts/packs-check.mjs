// Checks packs on a real device, in headless Chrome on a LOCAL server (it creates and deletes a test account, so never
// point it at the live site): packs saved on the device the way your AI's will arrive (study/packs.js), each checked
// before it's kept; what studying draws on following at once and after a reload; a pack's sentences played through
// every game; one pack on its own as a whole way to study; nothing on; a second language (the German test pack) with
// its evidence kept apart, and a practice in it with your AI (played by this script over MCP with a personal token);
// your AI's packs over MCP (refused when wrong, then taken by the device's own poll with Undo; add, change, take out,
// rename; undo from your AI and from the app; a second device: what fans out, what's missing, a delete reaching both;
// recordings your AI makes for a pack of yours, uploaded and checked, on both devices before the server lets them go,
// played from each device's own copy, undone, taken away, deleted with the pack);
// a stored pack that no longer passes left out; another tab following; public packs from the
// open library (Lexicommons' own arriving; its recordings with it, played from the library, kept for offline and
// credited on its page; a new version keeping your progress, a file that doesn't match its version
// refused, following one, a first start offline on the starter inside the app); and export and account deletion
// covering packs. Fails on any console error. Chrome runs muted: nothing is heard.
//
// Its server's library must have no default packs of its own (a fresh state): with Dutch's lessons and word bands seeded, what studying draws
// on, the counts and the library stages are other than it expects, and 14 stages fail (7 Nov).
// The test packs are scripts/fixtures/packs/check-nl.json and check-de.json (never shipped). The library stages put
// packs into the local server's library (scripts/packs/seed-local.mjs, through --persist-to) and put its catalog back
// exactly as it found it at the end.
// Usage (headless Chrome, through the channel's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "packs check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/packs-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { localR2 } from "./fixtures/local-r2.mjs";
import { ownText } from "./fixtures/step-text.mjs";
import { playToSummary } from "./fixtures/play-session.mjs";
import { BUILT_IN } from "../public/js/packs/index.js";
import { catalogueEntry, checkPack, packKey, packText, packUrl, packVersion, withPackEntry } from "../public/js/study/pack-format.js";

const [BASE, OUT = "packs-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("packs-check creates and deletes an account: give it a local server, e.g. http://localhost:8825");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const PERSIST = process.argv.includes("--persist-to") ? resolve(process.argv[process.argv.indexOf("--persist-to") + 1]) : null;
if (!PERSIST) {
  console.error("packs-check puts packs into the local server's library: give --persist-to <its wrangler state dir>.");
  process.exit(2);
}
const fixture = (name) => JSON.parse(readFileSync(join(HERE, "fixtures/packs", name), "utf8"));
const NL = fixture("check-nl.json");
const DE = fixture("check-de.json");

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

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await context.newPage();
// While a stage takes the page offline on purpose, a request failing for it (the app's own polling) is expected.
let offline = false;
const watch = (p) => {
  p.on("console", (m) => {
    if (m.type() === "error" && !(offline && /ERR_INTERNET_DISCONNECTED/.test(m.text()))) problems.push(`console: ${m.text()}`);
    if (m.type() === "warning") warnings.push(m.text());
  });
  p.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
};
watch(page);
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const SESSION = '[data-part="session"]:not([data-ghost])';
// Text nodes that are just "null" or "undefined" (an empty part appended raw), collected at every screenshot.
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

// What studying draws on right now, from the page's own modules.
const view = () =>
  page.evaluate(async () => {
    const c = await import("/js/study/content.js");
    return { language: c.contentLanguage(), items: c.ITEMS.map((i) => ({ ...i, sentence: c.sentence(i) })), words: { ...c.WORDS }, topics: { ...c.TOPICS }, packs: c.PACKS.map((p) => ({ ...p })), patterns: Object.keys(c.PATTERNS) };
  });
// The page's packs.js, as the collector for your AI's packs will use it.
const save = (pack) => page.evaluate(async ([pack]) => (await import("/js/study/packs.js")).savePack(pack, { by: "packs check" }), [pack]);
const setOn = (id, on, target = page) => target.evaluate(async ([id, on]) => (await import("/js/study/packs.js")).setPackOn(id, on), [id, on]);
/**
 * For a stage about the check's own German pack: German's packs from the library (on a state with a copy of the live
 * library, its starter) are synced first and turned off, so they can't arrive mid-stage. Returns what turns them back on.
 */
async function germanAlone() {
  const ids = await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    await packs.syncLibraryPacks();
    return packs.libraryPacks().filter((p) => p.language === "de").map((p) => p.id);
  });
  for (const id of ids) await setOn(id, false);
  return async () => {
    for (const id of ids) await setOn(id, true);
  };
}
const setLearning = (lang) => page.evaluate(async (lang) => (await import("/js/study/learning.js")).setLearning(lang), lang);
const packsState = () => page.evaluate(async () => {
  const p = await import("/js/study/packs.js");
  return { yours: p.yourPacks().map((r) => [r.id, r.by]), problems: p.packProblems() };
});
const evidence = () => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence());
const footer = () => page.locator('[data-part="page"]:not([hidden]) p.lx-packs-line').textContent();
// Study, then Your packs, where the packs and the line about them are (its foot).
const toStudy = async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.locator('[data-part="tab"]', { hasText: "Study" }).first().click();
  await page.waitForSelector('[data-part="list-row"]:has-text("Your packs")');
  await page.locator('[data-part="list-row"]', { hasText: "Your packs" }).first().click();
  await page.waitForFunction(() => location.hash === "#study/packs");
  await page.waitForSelector('[data-part="page"]:not([hidden]) .lx-packs-line');
};

// ---------- sessions, played by scripts/fixtures/play-session.mjs (each step by its kind, never its words) ----------

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


async function playThrough(hash, limit = 30) {
  await page.goto(`${BASE}/app/${hash}`);
  await page.waitForSelector('[data-part="session"]');
  // Each step as { kind, item: its sentence's id }.
  return (await playToSummary(page, { session: SESSION, limit })).map((step) => ({ kind: step.kind, item: step.item?.id }));
}

// ---------- the run ----------

await stage("sign up, land in the app: the built-in starter alone, as before", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Packs Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  const v = await view();
  assert(v.language === "nl" && v.items.length === 13, `${v.language}, ${v.items.length} items`);
  assert(JSON.stringify(v.packs.map((p) => [p.id, p.on, p.builtIn])) === '[["starter-word-order",true,true]]', JSON.stringify(v.packs));
  await toStudy();
  const line = await footer();
  assert(line.startsWith("Running on the built-in Starter: Dutch word order (13 sentences)."), line);
  return line.trim();
});

await stage("packs saved on the device are checked first: a Dutch and a German pack kept, a broken one refused", async () => {
  const saved = [await save(NL), await save(DE)];
  assert(saved.every((r) => r.ok && r.warnings.length === 0), JSON.stringify(saved));
  const broken = structuredClone(NL);
  broken.id = "check-broken";
  broken.items[0].gap.options = ["bal", "ballen"];
  broken.items[1].means = "";
  const refused = await save(broken);
  assert(!refused.ok && refused.errors.length === 2, JSON.stringify(refused));
  const builtIn = await save({ id: "starter-word-order" });
  assert(!builtIn.ok && /is a public pack's id; a pack of yours needs its own/.test(builtIn.errors[0].message), JSON.stringify(builtIn));
  const kept = (await packsState()).yours;
  assert(JSON.stringify(kept) === '[["check-nl","packs check"],["check-de","packs check"]]', JSON.stringify(kept));
  return { kept: kept.map(([id]) => id), refused: refused.errors.map((e) => e.message) };
});

await stage("studying follows at once: the Dutch pack's sentences after the starter's, German nowhere", async () => {
  const v = await view();
  assert(v.items.length === 16, `${v.items.length} items`);
  assert(v.items.slice(13).map((i) => i.id).join() === "check-nl/balletje,check-nl/eet-smakelijk,check-nl/oma-gebeld", v.items.slice(13).map((i) => i.id).join());
  assert(!v.items.some((i) => i.pack === "check-de"), "a German sentence in Dutch");
  assert(v.topics.food === "Food & drink" && v.patterns.includes("verkleinwoord"), JSON.stringify([v.topics, v.patterns]));
  await toStudy();
  const line = (await footer()).trim();
  assert(line.startsWith("Running on 2 packs (Starter: Dutch word order, A check pack (Dutch)): 16 sentences."), line);
  await shot("01-study-two-packs", { fullPage: true });
  return line;
});

await stage("after a reload: still there, checked again on the way in", async () => {
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const v = await view();
  assert(v.items.length === 16 && v.items[15].id === "check-nl/oma-gebeld", `${v.items.length}`);
  return `${v.items.length} sentences`;
});

await stage("the pack's own topic and pattern: sessions play its sentences through every game they reach", async () => {
  // The topic and pattern pickers went with More ways (E11): the pack's own topic and pattern are in the content's view (asserted above),
  // and the sessions on them play here.
  const food = await playThrough("#study/session/topic/food");
  assert(food.some((s) => s.item === "check-nl/eet-smakelijk"), JSON.stringify(food));
  const small = await playThrough(`#study/session/concept/${encodeURIComponent("p:verkleinwoord")}`);
  assert(small.some((s) => s.item === "check-nl/balletje"), JSON.stringify(small));
  const rows = (await evidence()).filter((r) => String(r.item).startsWith("check-nl/"));
  assert(rows.length && rows.every((r) => r.lang === "nl"), `rows ${rows.length}, langs ${[...new Set(rows.map((r) => r.lang))]}`);
  assert(rows.some((r) => r.concept === "c:eet-smakelijk") && rows.some((r) => r.concept === "p:verkleinwoord"), [...new Set(rows.map((r) => r.concept))].join());
  return { food: food.map((s) => s.kind), diminutive: small.map((s) => s.kind), rows: rows.length };
});

const games = new Set();
await stage("one pack on its own: the starter off, the quick session is the Dutch pack alone, through every game", async () => {
  await setOn("starter-word-order", false);
  const v = await view();
  assert(v.items.map((i) => i.id).join() === "check-nl/balletje,check-nl/eet-smakelijk,check-nl/oma-gebeld", v.items.map((i) => i.id).join());
  assert(v.topics.people === "Family & people" && v.words.oma === "grandma" && !v.words.boek, JSON.stringify([v.topics, v.words]));
  await toStudy();
  const line = (await footer()).trim();
  assert(line.startsWith("Running on A check pack (Dutch): 3 sentences."), line);
  await shot("03-study-one-pack", { fullPage: true });
  const steps = [];
  for (let round = 0; round < 3; round++) steps.push(...(await playThrough("#study/session/quick")));
  for (const kind of ["choose", "arrange", "place", "fill", "type", "match", "listen", "say", "repeat", "cards"]) {
    const game = kind === "cards" ? "#study/session/cards" : `#study/session/game/${kind}`;
    for (const step of await playThrough(game)) steps.push(step);
    games.add(kind);
  }
  const strays = steps.filter((s) => s.item && !s.item.startsWith("check-nl/"));
  assert(!strays.length, `steps from a pack that's off: ${JSON.stringify(strays)}`);
  return `${steps.length} steps, all from the pack; kinds: ${[...new Set(steps.map((s) => s.kind))].join(", ")}`;
});

await stage("every pack off: Study says there's nothing on, and nothing breaks", async () => {
  await setOn("check-nl", false);
  const v = await view();
  assert(v.items.length === 0, `${v.items.length}`);
  await page.goto(`${BASE}/app/#study`);
  await page.waitForSelector(".lx-study-packs");
  const text = await page.locator('[data-part="page"]').textContent();
  assert(text.includes("Every pack is off, so there's nothing to study."), "Study doesn't say why it's empty");
  assert((await page.locator('[data-part="page"] .lx-study-packs [data-part="switch"]').count()) >= 1, "the switches to fix it aren't there");
  assert(!(await page.locator('[data-part="study-door"]').count()), "a Start with nothing to study");
  // With every pack off, Study is the packs and their switches itself (no Your packs row to press): Your packs' own page says so too.
  await page.goto(`${BASE}/app/#study/packs`);
  await page.waitForSelector('[data-part="page"]:not([hidden]) .lx-packs-line');
  assert((await footer()).trim().startsWith("No pack is turned on."), await footer());
  await shot("04-study-nothing-on", { fullPage: true });
  await setOn("check-nl", true);
  await setOn("starter-word-order", true);
  assert((await view()).items.length === 16, "turning them back on");
  return "empty state shown; both back on";
});

await stage("German: the learning language switches what studying draws on, and German evidence is kept apart", async () => {
  const before = await page.evaluate(async () => {
    const p = await import("/js/study/progress.js");
    return { nl: p.studiedUnits("nl").length, de: p.studiedUnits("de").length };
  });
  await setLearning("de");
  const restore = await germanAlone();
  try {
    const v = await view();
    assert(v.language === "de" && v.items.map((i) => i.id).join() === "check-de/buch-gelesen,check-de/morgen-berlin,check-de/weiss-kommt", `${v.language} ${v.items.map((i) => i.id)}`);
    // The check pack's patterns, and otherwise only German's own catalog (lang/de.js).
    const catalog = await page.evaluate(async () => Object.keys((await import("/js/lang/index.js")).LANGUAGES.de.patterns ?? {}));
    assert(["v2", "perfect", "dass"].every((p) => v.patterns.includes(p)) && v.patterns.every((p) => catalog.includes(p) || ["v2", "perfect", "dass"].includes(p)) && v.words.Buch === "book", JSON.stringify([v.patterns, catalog, v.words]));
    const steps = await playThrough("#study/session/quick");
    await shot("05-german-session-summary");
    const after = await page.evaluate(async () => {
      const p = await import("/js/study/progress.js");
      return { nl: p.studiedUnits("nl").length, de: p.studiedUnits("de") };
    });
    const rows = (await evidence()).filter((r) => String(r.item).startsWith("check-de/"));
    assert(rows.length && rows.every((r) => r.lang === "de"), `German rows ${rows.length}: ${[...new Set(rows.map((r) => r.lang))]}`);
    assert(after.nl === before.nl, `Dutch units changed: ${before.nl} → ${after.nl}`);
    assert(after.de.includes("p:dass") && after.de.includes("w:Buch"), after.de.join());
    await setLearning("nl");
    assert((await view()).language === "nl" && (await view()).items.length === 16, "back to Dutch");
    return { steps: steps.length, germanUnits: after.de.length, dutchUnitsUnchanged: after.nl };
  } finally {
    // Dutch again, so a failure here can't carry into the stages after.
    await restore();
    await setLearning("nl");
  }
});

await stage("a stored pack that no longer passes the check is left out; the rest load", async () => {
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("lexicommons-packs", 1);
        open.onsuccess = () => {
          const tx = open.result.transaction("packs", "readwrite");
          const bad = { format: "lexicommons-pack", version: 2, id: "tampered", name: "Tampered", language: "nl", from: "en", items: [{ id: "x", concepts: ["v2"], words: [["<img src=x onerror=alert(1)>"]] }] };
          tx.objectStore("packs").put({ id: "tampered", pack: bad, addedAt: Date.now(), changedAt: Date.now(), by: "nobody" });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const problemsList = (await packsState()).problems;
  const v = await view();
  assert(problemsList.length === 1 && problemsList[0].id === "tampered", JSON.stringify(problemsList));
  assert(v.items.length === 16 && !v.items.some((i) => i.pack === "tampered"), `${v.items.length}`);
  assert(warnings.some((w) => w.includes('the pack "tampered" on this device didn\'t pass the check')), "no warning in the console");
  await page.evaluate(async () => (await import("/js/study/packs.js")).deletePack("tampered"));
  const afterDelete = await packsState();
  assert(!afterDelete.problems.some((p) => p.id === "tampered"), "the refused pack is still listed after deleting it");
  return `left out: ${problemsList[0].errors.map((e) => e.message).join(" · ")}`;
});

await stage("another tab follows: a pack changed there shows here", async () => {
  const other = await context.newPage();
  watch(other);
  await other.goto(`${BASE}/app/#study`);
  await other.waitForSelector("html[data-app-ready]");
  await setOn("check-nl", false, other);
  // Poll with evaluate: waitForFunction takes an async function's promise as true at once.
  let here = (await view()).items.length;
  for (let i = 0; i < 25 && here !== 13; i++) {
    await page.waitForTimeout(200);
    here = (await view()).items.length;
  }
  await setOn("check-nl", true, other);
  await other.close();
  assert(here === 13, `this tab still has ${here} sentences`);
  return "turned off in the other tab: 13 here";
});

// ---------- the packs and language pages ----------

const settingsPage = () => page.locator('[data-part="page"]');
const rowValue = async (title) => (await settingsPage().locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${escape(title)}$`) }) }).first().locator(".lx-row-value").textContent())?.trim();
const rowSub = async (title) => (await settingsPage().locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${escape(title)}$`) }) }).first().locator(".lx-row-sub").textContent())?.trim();
const goSettings = async (hash, text) => {
  await page.goto(`${BASE}/app/${hash}`);
  await page.waitForFunction((t) => document.querySelector('[data-part="page"]')?.textContent.includes(t), text);
};

await stage("Your packs (Study's row and its page): every pack of the language with its switch, flipping at once; a switch turns it off and on", async () => {
  await goSettings("#study", "Your packs");
  assert((await rowValue("Your packs")) === "2 on", `Study's Your packs row says ${await rowValue("Your packs")}`);
  await goSettings("#study/packs", "Find packs in Explore");
  const rows = () => settingsPage().locator('[data-part="switch-link-row"]');
  const titles = await rows().locator(".lx-row-title").allTextContents();
  const subs = await rows().locator(".lx-row-sub").allTextContents();
  assert(titles.join() === "Starter: Dutch word order,A check pack (Dutch)", titles.join());
  assert(subs.join() === "13 sentences,3 sentences · Yours", subs.join());
  await shot("07-packs-page");
  // The switch moves in the press; what studying draws on follows a frame later (settings-packs.js togglePack).
  const flip = async (want) => {
    await rows().nth(1).locator(".lx-row-switch").click();
    assert((await rows().nth(1).locator('input[role="switch"]').isChecked()) === want, "the switch didn't move at once");
    for (let i = 0; i < 40 && (await view()).packs.find((p) => p.id === "check-nl").on !== want; i++) await page.waitForTimeout(100);
  };
  await flip(false);
  let v = await view();
  assert(!v.packs.find((p) => p.id === "check-nl").on && v.items.length === 13, `off: ${v.items.length} sentences`);
  await goSettings("#study", "Your packs");
  assert((await rowValue("Your packs")) === "1 of 2 on", `Study's Your packs row says ${await rowValue("Your packs")}`);
  await goSettings("#study/packs", "Find packs in Explore");
  await flip(true);
  v = await view();
  assert(v.packs.find((p) => p.id === "check-nl").on && v.items.length === 16, `back on: ${v.items.length} sentences`);
  return "2 packs listed on Your packs; check-nl off (13 sentences, 1 of 2 on) and on again (16), each switch moving in its press";
});

await stage("a pack's own page: where it's from, its sentences in its language, its own switch", async () => {
  await goSettings("#study/packs", "Find packs in Explore");
  await settingsPage().locator('[data-part="switch-link-row"]').nth(1).locator('a[data-part="list-row"]').click();
  await page.waitForFunction(() => location.hash === "#settings/study/packs/check-nl" && document.querySelector('[data-part="page-title"]')?.textContent === "A check pack (Dutch)");
  for (const [title, value] of [["Made by", "packs check"], ["Language", "Dutch, from English"], ["Sentences", "3"]]) {
    assert((await rowValue(title)) === value, `${title}: ${await rowValue(title)}`);
  }
  assert((await rowSub("Topics")) === "Family & people, Food & drink", `Topics: ${await rowSub("Topics")}`);
  const sentences = await page.evaluate(() => {
    const label = [...document.querySelectorAll('[data-part="page"] .lx-choice-title')].find((h) => h.textContent === "Its sentences");
    return [...(label?.closest("section")?.querySelectorAll(".lx-row-title") ?? [])].map((n) => [n.textContent, n.getAttribute("lang")]);
  });
  assert(sentences.length === 3 && sentences.every(([, lang]) => lang === "nl") && sentences[1][0] === "Eet smakelijk!", JSON.stringify(sentences));
  await shot("08-pack-page", { fullPage: true });
  await settingsPage().locator("label.lx-row-control", { hasText: "Study with it" }).click();
  assert(!(await view()).packs.find((p) => p.id === "check-nl").on, "its own switch didn't turn it off");
  await settingsPage().locator("label.lx-row-control", { hasText: "Study with it" }).click();
  assert((await view()).packs.find((p) => p.id === "check-nl").on, "its own switch didn't turn it on again");
  return "From, Language, Sentences, Topics; 3 sentences (lang nl); off and on from its page";
});

await stage("the starter's page: its recorded voices take turns, or you keep one", async () => {
  await goSettings("#settings/study/packs/starter-word-order", "About it");
  await page.waitForFunction(() => document.querySelector('[data-part="page"]')?.textContent.includes("Its voices"), null, { timeout: 10_000 });
  const voices = await settingsPage().locator('input[name="pin"]').evaluateAll((nodes) => nodes.map((n) => [n.value, n.checked]));
  assert(voices.length >= 2 && voices[0][0] === "" && voices[0][1], `voices: ${JSON.stringify(voices)}`);
  const keep = voices[1][0];
  await settingsPage().locator(`input[name="pin"][value="${keep}"]`).locator("xpath=ancestor::label").click();
  const pinned = await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().listening.pins["starter-word-order"]);
  assert(pinned === keep, `pinned ${pinned}`);
  await shot("09-starter-voices", { fullPage: true });
  await settingsPage().locator('input[name="pin"][value=""]').locator("xpath=ancestor::label").click();
  const after = await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().listening.pins["starter-word-order"]);
  assert(after === null, `still pinned: ${after}`);
  return `kept ${keep}, then back to taking turns`;
});

await stage("a pack's page shows what the rest of the app offers for it (pack-actions.js), and runs it", async () => {
  await page.evaluate(async () => {
    const { addPackAction } = await import("/js/study/pack-actions.js");
    addPackAction((pack, info) => (info.kind === "yours" ? [{ label: "A check action", icon: "info", run: () => (document.documentElement.dataset.checkAction = pack.id) }] : []));
  });
  await goSettings("#settings/study/packs/check-nl", "A check action");
  await settingsPage().locator('[data-part="list-row"]', { hasText: "A check action" }).click();
  assert((await page.evaluate(() => document.documentElement.dataset.checkAction)) === "check-nl", "the action didn't run");
  await goSettings("#settings/study/packs/starter-word-order", "About it");
  assert(!(await settingsPage().textContent()).includes("A check action"), "an action for yours showed on Lexicommons' own");
  return "shown and run on a pack of yours; not on the starter";
});

await stage("deleting a pack of yours from its page (two presses), and only yours offer it", async () => {
  assert(!(await settingsPage().textContent()).includes("Delete this pack"), "the starter offers delete");
  const saved = await save({ ...structuredClone(NL), id: "check-delete", name: "A pack to delete" });
  assert(saved.ok, JSON.stringify(saved));
  await goSettings("#settings/study/packs/check-delete", "Delete this pack");
  await settingsPage().locator('[data-part="list-row"]', { hasText: "Delete this pack" }).click();
  await settingsPage().locator('[data-part="list-row"]', { hasText: "Press again to delete it" }).click();
  await page.waitForFunction(() => location.hash === "#study/packs");
  assert(!(await packsState()).yours.some(([id]) => id === "check-delete"), "still on the device");
  return "deleted; back on the packs page";
});

await stage("Settings → Language: German, picked there, renames every screen and its text's lang", async () => {
  await goSettings("#settings", "Language");
  assert((await rowValue("Language")) === "Dutch", `menu: ${await rowValue("Language")}`);
  await goSettings("#settings/language", "Add a language");
  const options = await settingsPage().locator('input[name="learning"]').evaluateAll((nodes) => nodes.map((n) => [n.value, n.checked]));
  assert(JSON.stringify(options) === '[["nl",true],["de",false]]', JSON.stringify(options));
  await shot("10-language-page");
  await settingsPage().locator('input[name="learning"][value="de"]').locator("xpath=ancestor::label").click();
  try {
    for (let i = 0; i < 25 && (await view()).language !== "de"; i++) await page.waitForTimeout(100);
    assert((await view()).language === "de", "the language didn't change");
    await goSettings("#settings", "Language");
    assert((await rowValue("Language")) === "German", `menu: ${await rowValue("Language")}`);
    await page.goto(`${BASE}/app/#today`);
    await page.locator('[data-part="tab"]', { hasText: "Study" }).first().click();
    await page.waitForSelector('[data-part="study-door"]');
    // The games are buttons on Study's page (their names); what each is about is the games' own words (plan.js GAMES).
    await page.waitForSelector('[data-part="page"] [data-part="way-tile"]');
    const ways = await page.locator('[data-part="page"] [data-part="way-tile"]').allTextContents();
    const lines = await page.evaluate(async () => Object.values((await import("/js/study/plan.js")).GAMES).map((game) => game.about));
    assert(ways.includes("Put it in German order") && lines.includes("Pick the right German order") && lines.includes("Pair German words with English"), `${ways.join(" | ")} || ${lines.join(" | ")}`);
    await shot("11-study-in-german", { fullPage: true });
    await page.goto(`${BASE}/app/#study/session/cards`);
    await page.waitForSelector(`${SESSION} [data-part="target-line"]`);
    const card = await page.evaluate(() => {
      const s = document.querySelector('[data-part="session"]:not([data-ghost])');
      return {
        prompt: s.querySelector('[data-part="activity-prompt"] > span')?.textContent,
        lang: s.querySelector('[data-part="target-line"]').getAttribute("lang"),
        labels: [...s.querySelectorAll(".lx-order-label")].map((n) => [n.textContent, n.getAttribute("lang")]),
      };
    });
    assert(card.prompt === "Read it in German" && card.lang === "de", JSON.stringify(card));
    assert(!card.labels.length || JSON.stringify(card.labels) === '[["DE","de"],["EN",null]]', JSON.stringify(card.labels));
    await shot("12-german-card");
    await page.goto(`${BASE}/app/#study/session/game/arrange`);
    await page.waitForSelector(`${SESSION} [data-part="activity-prompt"]`);
    const prompt = await page.locator(`${SESSION} [data-part="activity-prompt"] > span`).first().evaluate(ownText);
    assert(/^Put (it|the English) in German order$/.test(prompt.trim()), prompt);
    await goSettings("#settings/language", "Add a language");
    await settingsPage().locator('input[name="learning"][value="nl"]').locator("xpath=ancestor::label").click();
    for (let i = 0; i < 25 && (await view()).language !== "nl"; i++) await page.waitForTimeout(100);
    assert((await view()).language === "nl", "back to Dutch");
    return `German: "${card.prompt}", "${prompt.trim()}", lang de, the order switch ${card.labels.map(([t]) => t).join("/") || "(none on this card)"}; then Dutch again`;
  } finally {
    await setLearning("nl");
  }
});

// ---------- a practice in German, your AI played over MCP ----------

let token = null;
async function mcp(method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}
async function tool(name, args = {}) {
  const result = await mcp("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}
const ROOM = ".lx-practice-room:not([data-ghost])";
const practiceRows = (id) => page.evaluate(async (id) => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.practice === id), id);
async function until(fn, arg, timeout = 15_000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 140)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

await stage("your AI's side names the language: the guide, the prompts, get_learner", async () => {
  token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Packs check" }) })).json()).token);
  assert(token?.startsWith("lct_"), "a token for the AI");
  // As the AI section's page does on making one: the device learns it has an AI, and only then do its own packs' copies go (pack-inbox.js copyGoes).
  await page.evaluate(async () => {
    const { whoAmI } = await import("/js/shell/api.js");
    const { setAiConnected } = await import("/js/shell/layout.js");
    setAiConnected((await whoAmI()).aiConnected);
  });
  const guide = await tool("get_practice_guide");
  assert(guide.guide.includes("## The language") && !/Grading their Dutch|Natural everyday Dutch/.test(guide.guide), "the guide is the same for every language");
  const prompts = (await mcp("prompts/list", {})).prompts.filter((p) => p.name.startsWith("practise")).map((p) => p.title);
  assert(JSON.stringify(prompts) === '["Practice with me in Lexicommons","Practice with me here"]', JSON.stringify(prompts));
  return `prompts: ${prompts.join(" · ")}`;
});

await stage("a practice in German: your AI is told the language, the room draws and hears it in German, its evidence is German", async () => {
  await setOn(DE.id, true);
  await setLearning("de");
  const restore = await germanAlone();
  try {
    for (let i = 0; i < 25 && (await view()).language !== "de"; i++) await page.waitForTimeout(100);
    await page.goto(`${BASE}/app/#study/practice/new/conversation`);
    await page.getByText("Then tell your AI to practice German with you in Lexicommons.", { exact: false }).waitFor();
    const waiting = tool("practice_wait", { wait_seconds: 40 });
    await page.getByRole("button", { name: "Start" }).click();
    await page.locator(ROOM).waitFor();
    const joined = await waiting;
    const { practice, learner } = joined;
    assert(joined.status === "joined" && practice.language === "de" && practice.languageName === "German" && practice.locale === "de-DE", `joined: ${JSON.stringify(practice)}`);
    assert(learner.language === "de" && learner.languageName === "German" && learner.examples.some((e) => e.nl === "Ich habe gestern ein Buch gelesen."), `learner: ${JSON.stringify({ language: learner.language, examples: learner.examples }).slice(0, 300)}`);
    assert(learner.patterns.some((x) => x.id === "p:dass") && !learner.patterns.some((x) => x.id === "p:omte"), `German patterns only: ${learner.patterns.map((x) => x.id)}`);
    const ai = { id: practice.id, seat: joined.seat, after: joined.after };
    const wait = async () => {
      for (;;) {
        const r = await tool("practice_wait", { practice_id: ai.id, seat: ai.seat, after: ai.after, wait_seconds: 20 });
        if (r.status === "waiting") continue;
        if (r.after !== undefined) ai.after = r.after;
        return r;
      }
    };
    const reply = (body) => tool("practice_reply", { practice_id: ai.id, seat: ai.seat, ...body });

    // Its line and a sentence to translate, in German; your answer typed in German.
    await reply({ say: { nl: "Was hast du gestern gemacht?", literal: ["What", "have", "you", "*yesterday*", "*done*"], en: "What did you do yesterday?" }, translate: "I read a book yesterday.", expect: "type" });
    await page.locator(`${ROOM} [data-part="chat-line"][data-variant="task"]`).waitFor();
    const drawn = await page.evaluate((sel) => {
      const room = document.querySelector(sel);
      const input = room.querySelector('[data-part="composer"] input');
      return { line: room.querySelector('[data-part="chat-line"][data-variant="ai"] .lx-chat-nl')?.getAttribute("lang"), task: room.querySelector('[data-part="chat-line"][data-variant="task"] .lx-chat-label')?.textContent, input: [input?.getAttribute("lang"), input?.getAttribute("placeholder")] };
    }, ROOM);
    assert(drawn.line === "de" && drawn.task?.includes("Say it in German") && drawn.input[0] === "de" && drawn.input[1] === "Type in German…", JSON.stringify(drawn));
    const turn = wait();
    await page.locator(`${ROOM} [data-part="composer"] input`).fill("Ich habe gestern ein Buch gelest");
    await page.locator(`${ROOM} [data-part="composer"] input`).press("Enter");
    const said = await turn;
    assert(said.status === "your_move" && said.turns[0].text === "Ich habe gestern ein Buch gelest", JSON.stringify(said).slice(0, 200));
    await page.locator(`${ROOM} [data-part="chat-line"][data-variant="you"][data-state="sent"] [data-part="chat-said"][lang="de"]`).waitFor();

    // The grade: German's capitalized lemma kept, the evidence in German.
    await reply({ grade: { turn: said.turns[0].seq, verdict: "fixed", better: "Ich habe gestern ein Buch gelesen.", marks: [{ said: "gelest", fix: "gelesen" }], concepts: [{ concept: "p:perfect", outcome: "wrong" }, { concept: "w:Buch", outcome: "right" }] } });
    await page.locator(`${ROOM} [data-part="correction"] .lx-correction-better[lang="de"]`).waitFor();
    await until(async (id) => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.practice === id).length >= 2, ai.id);
    const graded = await practiceRows(ai.id);
    assert(graded.every((row) => row.lang === "de") && graded.some((row) => row.concept === "w:Buch" && row.outcome === "right"), JSON.stringify(graded.map((r) => [r.concept, r.outcome, r.lang])));

    // A card in German: its prompt, hint and tiles name and carry the language; its evidence is German too.
    const dealt = wait();
    await reply({ card: { game: "arrange", nl: "Ich habe gestern ein Buch gelesen.", en: "I read a book yesterday.", literal: ["I have", "*yesterday*", "a book", "*read*"], english: [0, 3, 2, 1], moved: ["gestern", "gelesen"], patterns: ["perfect"], words: { gestern: "gestern", Buch: "Buch", gelesen: "lesen" } } });
    const card = page.locator(`${ROOM} [data-part="chat"] > [data-part="practice-card"]`).last();
    await card.waitFor();
    const shown = await card.evaluate((node) => ({
      prompt: node.querySelector('[data-part="activity-prompt"] > span')?.textContent,
      hint: [...node.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => t.startsWith("Hint")),
      tiles: [...new Set([...node.querySelectorAll('[data-part="tile"]')].map((t) => t.getAttribute("lang")))],
    }));
    assert(shown.prompt === "Put it in German order" && shown.hint === "Hint: German order" && JSON.stringify(shown.tiles) === '["de"]', JSON.stringify(shown));
    await shot("13-practice-german");
    await card.getByRole("button", { name: "I don't know" }).click();
    const result = await dealt;
    assert(result.status === "your_move" && result.turns.at(-1).type === "card", JSON.stringify(result).slice(0, 200));
    await until(async (id) => (await import("/js/study/progress.js")).allEvidence().some((row) => row.practice === id && row.activity === "arrange"), ai.id);
    const cardRows = (await practiceRows(ai.id)).filter((row) => row.activity === "arrange");
    assert(cardRows.every((row) => row.lang === "de") && cardRows.some((row) => row.concept === "w:Buch"), JSON.stringify(cardRows.map((r) => [r.concept, r.outcome, r.lang])));

    // The end: the summary's new word in German, its concept German evidence.
    const ending = wait();
    await page.locator(ROOM).getByRole("button", { name: "End", exact: true }).click();
    assert((await ending).status === "ended", "the AI sees the end");
    await tool("practice_end", { practice_id: ai.id, seat: ai.seat, summary: { text: "Gut gemacht.", new_words: [{ nl: "das Buch", en: "the book" }], concepts: [{ concept: "w:Zug", outcome: "right" }] } });
    await page.locator(`${ROOM} [data-part="session-summary"] span[lang="de"]`, { hasText: "das Buch" }).waitFor({ timeout: 30_000 });
    await until(async (id) => (await import("/js/study/progress.js")).allEvidence().some((row) => row.practice === id && row.concept === "w:Zug"), ai.id);
    const all = await practiceRows(ai.id);
    assert(all.every((row) => row.lang === "de"), JSON.stringify(all.map((r) => [r.concept, r.lang])));
    await page.locator(ROOM).getByRole("button", { name: "Done" }).click();
    ai.rows = all.length;

    // A conversation logged from the AI's own app, with no language said: German, from get_learner.
    const logged = await tool("practice_log", { turns: [{ who: "ai", nl: "Wie geht es dir?", en: "How are you?" }, { who: "you", text: "Mir geht es gut", grade: { verdict: "right", concepts: [{ concept: "w:gut", outcome: "right" }] } }], done: true, summary: { text: "Kurz." } });
    const listed = await tool("list_practices");
    const both = listed.filter((p) => p.practice_id === ai.id || p.practice_id === logged.practiceId).map((p) => p.language);
    assert(both.length === 2 && both.every((language) => language === "de"), `list_practices: ${JSON.stringify(listed)}`);
    // Opening Practice collects it (Done already left the page on Practice, so go there again).
    await page.goto(`${BASE}/app/#today`);
    await page.goto(`${BASE}/app/#study/practice`);
    await until(async (id) => (await import("/js/study/progress.js")).allEvidence().some((row) => row.practice === id), logged.practiceId);
    const loggedRows = await practiceRows(logged.practiceId);
    assert(loggedRows.length === 1 && loggedRows[0].lang === "de", JSON.stringify(loggedRows));
    ai.logged = logged.practiceId;

    // Back in Dutch: the German practices say so, and a past one still draws in German.
    await setLearning("nl");
    for (let i = 0; i < 25 && (await view()).language !== "nl"; i++) await page.waitForTimeout(100);
    await page.goto(`${BASE}/app/#today`);
    await page.goto(`${BASE}/app/#study/practice`);
    await page.getByText("Practice Dutch with me here").waitFor();
    // The one held in the app (the logged one's title says "in your AI").
    const row = page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^Conversation$/ }) }).filter({ hasText: "German" }).first();
    await row.waitFor();
    await row.click();
    await page.locator('[data-part="session-summary"]').waitFor();
    const past = await page.evaluate(() => ({
      sub: document.querySelector('[data-part="page-title"]')?.parentElement?.textContent ?? "",
      line: document.querySelector('[data-part="page"] [data-part="chat-line"][data-variant="ai"] .lx-chat-nl')?.getAttribute("lang"),
      said: document.querySelector('[data-part="page"] [data-part="chat-said"]')?.getAttribute("lang"),
      tiles: [...new Set([...document.querySelectorAll('[data-part="page"] [data-part="tile"]')].map((t) => t.getAttribute("lang")))],
    }));
    assert(past.sub.includes("German") && past.line === "de" && past.said === "de" && JSON.stringify(past.tiles) === '["de"]', JSON.stringify(past));
    await shot("14-past-german-practice");
    return `joined in German (de-DE); ${ai.rows} evidence rows, all de, w:Buch kept; the logged one German from get_learner; shown as German from Dutch`;
  } finally {
    await restore();
    await setLearning("nl");
  }
});

// ---------- your AI's packs over MCP, through the relay, on two devices ----------

const takeNow = (target = page) => target.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
const failsWith = async (name, args) => {
  const result = await mcp("tools/call", { name, arguments: args });
  assert(result.isError, `${name} should have been refused: ${result.content[0].text.slice(0, 200)}`);
  try {
    return JSON.parse(result.content[0].text);
  } catch {
    throw new Error(`${name} was refused, but not by the pack check: ${result.content[0].text.slice(0, 200)}`);
  }
};
const travelItem = (sentence, lemmas, literal, english, natural, wrong, gap, patterns, extra = {}) => ({ sentence, lemmas, literal, english, natural, wrong, gap, topic: "travel", patterns, ...extra });
const TRAVEL = [
  travelItem("Waar is het station?", { waar: "waar", station: "station" }, ["Where", "is", "the station?"], [0, 1, 2], "Where is the station?", ["Waar het station is?", "Is waar het station?"], { word: "is", options: ["is", "zijn", "ben"] }, ["question"]),
  travelItem("Morgen neem ik de trein.", { morgen: "morgen", neem: "nemen", trein: "trein" }, ["Tomorrow", "*take*", "I", "the train"], [0, 2, 1, 3], "Tomorrow I'm taking the train.", ["Morgen ik neem de trein.", "Ik morgen neem de trein."], { word: "neem", options: ["neem", "neemt", "nemen"] }, ["v2"], { moved: ["neem"] }),
  travelItem("Ik wil een kaartje kopen.", { wil: "willen", kaartje: "kaartje", kopen: "kopen" }, ["I want", "a ticket", "*buy*"], [0, 2, 1], "I want to buy a ticket.", ["Ik wil kopen een kaartje.", "Ik een kaartje wil kopen."], { word: "kopen", options: ["kopen", "koopt", "koop"] }, ["modal"], { moved: ["kopen"] }),
];
const BUS = travelItem("Hoe laat vertrekt de bus?", { laat: "laat", vertrekt: "vertrekken", bus: "bus" }, ["How late", "leaves", "the bus?"], [0, 1, 2], "What time does the bus leave?", ["Hoe laat de bus vertrekt?", "Hoe vertrekt laat de bus?"], { word: "vertrekt", options: ["vertrekt", "vertrekken", "vertrek"] }, ["question"]);
const TRAVEL_WORDS = { waar: "where", station: "station", nemen: "to take", trein: "train", willen: "to want", kaartje: "ticket", kopen: "to buy", laat: "late", vertrekken: "to leave", bus: "bus" };
const packHere = (id, target = page) => target.evaluate(async (id) => (await import("/js/study/packs.js")).yourPack(id)?.pack ?? null, id);
const changes = (args = {}) => tool("list_pack_changes", args);
const ids = {};
let secondDevice = null;

await stage("your AI makes a pack: refused at once when it's wrong, then on its way, and this device takes it within seconds", async () => {
  await takeNow();
  const before = await tool("list_packs");
  assert(before.yours.some((p) => p.pack_id === "check-nl") && before.devices.length === 1, `this device's packs reach the account: ${JSON.stringify(before).slice(0, 300)}`);
  const guide = await tool("get_pack_guide");
  assert(/One pack, or a separate one/.test(guide.guide) && guide.exampleItem.sentence, "the guide");
  // Wrong: refused, every problem at once, at the item it's in, and nothing kept.
  const bad = await failsWith("create_pack", { name: "Travel check", language: "nl", items: [{ sentence: "Waar is de bus?", literal: ["Where", "is", "the bus?"], natural: "Where is the bus?", wrong: ["Waar de bus is?"], gap: { word: "trein", options: ["trein", "bus"] }, patterns: ["nope"] }] });
  assert(bad.errors.some((e) => e.at === "items[0].gap.word") && /Nothing was kept/.test(bad.next), JSON.stringify(bad).slice(0, 400));
  assert(!(await changes()).some((c) => c.pack_id === "travel-check"), "nothing was queued");
  const dry = await tool("check_items", { language: "nl", items: TRAVEL, topics: { travel: "Travel" }, words: TRAVEL_WORDS });
  assert(dry.ok && !dry.errors.length, `check_items: ${JSON.stringify(dry).slice(0, 300)}`);
  const made = await tool("create_pack", { name: "Travel check", about: "Getting around", language: "nl", items: TRAVEL, topics: { travel: "Travel" }, words: TRAVEL_WORDS });
  assert(made.pack_id === "travel-check" && made.change_id && made.sentences === 3, JSON.stringify(made));
  ids.create = made.change_id;
  // The device's own poll takes it (no nudge): within a poll or two.
  const started = Date.now();
  await until(async () => Boolean((await import("/js/study/packs.js")).yourPack("travel-check")), undefined, 20_000);
  const ms = Date.now() - started;
  await page.locator('[data-part="toast"]', { hasText: "made Travel check (3 sentences)" }).waitFor();
  assert((await page.locator('[data-part="toast"] button', { hasText: "Undo" }).count()) === 1, "the toast has Undo");
  await shot("15-your-ai-made-a-pack");
  const v = await view();
  assert(v.items.filter((i) => i.pack === "travel-check").length === 3, "studying draws on it");
  const [first] = await changes();
  assert(first.change_id === made.change_id && first.state === "applied" && first.devices.length === 1 && first.devices[0].state === "applied", JSON.stringify(first));
  await takeNow();
  const read = await tool("get_pack", { pack_id: "travel-check" });
  assert(read.sentences === 3 && read.items[1].sentence === "Morgen neem ik de trein." && read.items[1].literal[1] === "*take*" && read.items[1].lemmas.neem === "nemen" && read.copy.from, JSON.stringify(read).slice(0, 400));
  ids.items = read.items.map((item) => item.id);
  return `refused with ${bad.errors.length} problems and nothing kept; made and taken by the device's own poll in ${ms} ms; get_pack reads it back`;
});

await stage("add, change, take out and rename: each checked against the pack, each arriving as checked", async () => {
  // A sentence the pack has is refused, and the problem names the item in the list it came in.
  const dup = await failsWith("add_items", { pack_id: "travel-check", items: [BUS, TRAVEL[0]] });
  assert(dup.errors.some((e) => /items\[1\]/.test(e.at) && /same sentence/.test(e.message)), JSON.stringify(dup.errors));
  const added = await tool("add_items", { pack_id: "travel-check", items: [BUS] });
  ids.add = added.change_id;
  await takeNow();
  assert((await packHere("travel-check")).items.length === 4, "added");
  const changed = await tool("update_items", { pack_id: "travel-check", items: [{ ...TRAVEL[1], id: ids.items[1], natural: "Tomorrow I take the train." }] });
  ids.update = changed.change_id;
  await takeNow();
  assert((await packHere("travel-check")).items[1].means === "Tomorrow I take the train.", "changed in place");
  const removed = await tool("remove_items", { pack_id: "travel-check", ids: [ids.items[2]] });
  ids.remove = removed.change_id;
  await takeNow();
  assert((await packHere("travel-check")).items.length === 3, "taken out");
  // Two at once: each is checked against the pack as it is, so they land one after the other or the second is told
  // to check again; never both through the same check.
  const twins = [
    { ...BUS, sentence: "Hoe laat komt de bus?", natural: "What time does the bus come?", wrong: ["Hoe laat de bus komt?"], lemmas: { laat: "laat", komt: "komen", bus: "bus" }, gap: { word: "komt", options: ["komt", "komen"] } },
    { ...BUS, sentence: "Hoe laat gaat de bus?", natural: "What time does the bus go?", wrong: ["Hoe laat de bus gaat?"], lemmas: { laat: "laat", gaat: "gaan", bus: "bus" }, gap: { word: "gaat", options: ["gaat", "gaan"] } },
  ];
  const both = await Promise.all(twins.map((item) => mcp("tools/call", { name: "add_items", arguments: { pack_id: "travel-check", items: [item] } })));
  const landed = both.filter((r) => !r.isError).map((r) => JSON.parse(r.content[0].text).change_id);
  assert(landed.length >= 1 && both.every((r) => !r.isError || /same moment/.test(r.content[0].text)), both.map((r) => r.content[0].text.slice(0, 120)).join(" | "));
  await takeNow();
  assert((await packHere("travel-check")).items.length === 3 + landed.length, "each one that landed is on the device");
  const newestFirst = (await changes({ pack_id: "travel-check" })).map((c) => c.change_id).filter((id) => landed.includes(id));
  for (const id of newestFirst) await tool("undo_pack_change", { change_id: id });
  await takeNow();
  assert((await packHere("travel-check")).items.length === 3, "and undone");
  const renamed = await tool("update_pack", { pack_id: "travel-check", name: "Trips" });
  ids.edit = renamed.change_id;
  await takeNow();
  assert((await packHere("travel-check")).name === "Trips", "renamed");
  const read = await tool("get_pack", { pack_id: "travel-check" });
  assert(read.name === "Trips" && read.sentences === 3 && !read.includesOnTheirWay, JSON.stringify(read).slice(0, 200));
  return `duplicate refused at items[1]; added, changed, taken out, renamed, each on the device; two at once: ${landed.length} landed, ${2 - landed.length} told to check again`;
});

await stage("undo: the latest change first, from your AI and from the app", async () => {
  const early = await mcp("tools/call", { name: "undo_pack_change", arguments: { change_id: ids.add } });
  assert(early.isError && early.content[0].text.includes(ids.edit), `a later change comes first: ${early.content[0].text}`);
  await tool("undo_pack_change", { change_id: ids.edit });
  await takeNow();
  assert((await packHere("travel-check")).name === "Travel check", "the rename undone");
  const [undid] = await changes({ pack_id: "travel-check" });
  assert(undid.said === "undid a change: renamed Travel check to Trips", undid.said);
  // From the app: the pack's page lists what your AI did, and Undo takes back the latest.
  await goSettings("#settings/study/packs/travel-check", "Changes");
  const row = settingsPage().locator('[data-part="list-row"]', { hasText: "took 1 sentence out of" });
  await row.getByRole("button", { name: "Undo" }).click();
  await page.locator('[data-part="toast"]', { hasText: "Undone: took 1 sentence out of" }).waitFor();
  // The page follows at once: the change says it's undone, and Undo moves to the one before it.
  await row.filter({ hasText: "Undone" }).waitFor();
  await settingsPage().locator('[data-part="list-row"]', { hasText: "changed 1 sentence in" }).getByRole("button", { name: "Undo" }).waitFor();
  await until(async () => (await import("/js/study/packs.js")).yourPack("travel-check")?.pack.items.length === 4);
  await shot("16-changes-and-undo");
  const list = await changes({ pack_id: "travel-check" });
  const remove = list.find((c) => c.change_id === ids.remove);
  assert(remove.state === "undone" && remove.undoneBy, JSON.stringify(remove));
  assert(list[0].by.startsWith("device:") && list[0].kind === "undo", `the app's undo is in the list: ${JSON.stringify(list[0])}`);
  // Corrections you accepted in Explore to a pack you shared (src/packs.ts queueOwnerChange) arrive named for Explore,
  // in their toast and on the pack's page.
  const named = await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).whoMade("explore:corrections"));
  assert(named === "Explore", `a change from Explore is named "${named}"`);
  return "the latest first (the earlier one named the later); the rename undone by your AI, the removal by the app";
});

await stage("a second device: both take your AI's changes; a pack made before it came is on the other; a delete reaches both", async () => {
  const state = await context.storageState();
  state.origins = state.origins.map((o) => ({ ...o, localStorage: o.localStorage.filter((e) => e.name !== "lx.pack-inbox.v1") }));
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: state });
  const page2 = await second.newPage();
  watch(page2);
  try {
    await page2.goto(`${BASE}/app/#study`);
    await page2.waitForSelector("html[data-app-ready]");
    await takeNow(page2);
    assert((await tool("list_packs")).devices.length === 2, "two devices");
    // A change to a pack the second device never had: the first applies it, the second says it's missing.
    const more = await tool("add_items", { pack_id: "travel-check", items: [{ ...BUS, sentence: "Waar vertrekt de bus?", natural: "Where does the bus leave from?", wrong: ["Waar de bus vertrekt?"], lemmas: { waar: "waar", vertrekt: "vertrekken", bus: "bus" }, literal: ["Where", "leaves", "the bus?"] }] });
    await takeNow();
    await takeNow(page2);
    const [latest] = await changes({ pack_id: "travel-check" });
    assert(latest.change_id === more.change_id && latest.devices.map((d) => d.state).sort().join() === "applied,missing", JSON.stringify(latest.devices));
    await page2.goto(`${BASE}/app/#study/packs`);
    await page2.locator('[data-part="page"]', { hasText: "On your other device" }).waitFor();
    assert(await page2.locator('[data-part="list-row"]', { hasText: "Travel check" }).count(), "it names the pack");
    await page2.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
    await page2.screenshot({ path: join(OUT, "shots", "17-second-device-missing.png") });
    // A new pack reaches both.
    const trip = await tool("create_pack", { name: "Trip two", language: "nl", items: [TRAVEL[0]], topics: { travel: "Travel" } });
    await takeNow();
    await takeNow(page2);
    assert((await packHere("trip-two")) && (await packHere("trip-two", page2)), "on both devices");
    // Deleted on the second device's page: gone on the first too.
    await page2.goto(`${BASE}/app/#settings/study/packs/trip-two`);
    const del = page2.locator('[data-part="list-row"]', { hasText: "Delete this pack" });
    await del.click();
    await page2.locator('[data-part="list-row"]', { hasText: "Press again to delete it" }).click();
    await page2.waitForFunction(() => location.hash === "#study/packs");
    await takeNow();
    assert(!(await packHere("trip-two")) && !(await packHere("trip-two", page2)), "deleted on both");
    const [gone] = await changes({ pack_id: "trip-two" });
    assert(gone.kind === "delete" && gone.by.startsWith("device:") && gone.devices.every((d) => d.state === "applied"), JSON.stringify(gone));
    return `missing on the device that never had it (applied on the other); ${trip.pack_id} on both, then deleted from the second and gone from the first`;
  } finally {
    // The same second device comes back for the recordings (a device that never came back keeps a change on its way).
    secondDevice = await second.storageState().catch(() => null);
    await second.close();
  }
});

await stage("your AI records a pack of yours: uploaded and checked, on both devices before the server lets the clips go, played from each device, undone and taken away", async () => {
  assert(secondDevice, "the second device from the stage before");
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: secondDevice });
  const page2 = await second.newPage();
  watch(page2);
  // As the device asks (its cookies), without the page logging the 404s this expects.
  const status = async (target, url) => (await target.request.get(`${BASE}${url}`)).status();
  const offered = (target) => target.evaluate(async () => (await import("/js/study/packs.js")).packAudio("sound-check"));
  const keptHere = (target, names) => target.evaluate(async (names) => {
    const cache = await caches.open("lx-audio-v1");
    return Promise.all(names.map(async (name) => Boolean(await cache.match(`/api/packs/audio/${name}`))));
  }, names);
  try {
    await page2.goto(`${BASE}/app/#study`);
    await page2.waitForSelector("html[data-app-ready]");
    await takeNow(page2);
    await tool("create_pack", { name: "Sound check", language: "nl", items: TRAVEL, topics: { travel: "Travel" }, words: TRAVEL_WORDS });
    await takeNow();
    await takeNow(page2);
    assert((await packHere("sound-check")) && (await packHere("sound-check", page2)), "the pack on both devices");
    const read = await tool("get_pack", { pack_id: "sound-check" });
    assert(Array.isArray(read.recordings) && !read.recordings.length, JSON.stringify(read.recordings));
    const [one, two] = read.items;
    const timings = (item) => item.sentence.replace(/[.?!]+$/, "").split(" ").map((_, n) => [n * 0.3, n * 0.3 + 0.25]);
    // Real recordings (the starter's MP3s), each sent to its own signed link; and a text file dressed as one.
    const clipsDir = join(APP, "public/audio/starter-word-order/emma");
    const bytes = ["boek-gelezen.mp3", "morgen-oma.mp3", "w-gisteren.mp3"].map((name) => readFileSync(join(clipsDir, name)));
    const names = bytes.map((b) => `${createHash("sha256").update(b).digest("hex").slice(0, 16)}.mp3`);
    const upload = async (body, filename) => {
      const ticket = await tool("request_pack_audio_upload", { pack_id: "sound-check", format: "mp3", filename });
      const put = await fetch(ticket.upload_url, { method: "PUT", headers: { "Content-Type": ticket.content_type }, body });
      assert(put.ok, `${filename}: ${put.status} ${await put.text()}`);
      return ticket.upload_id;
    };
    const ups = [];
    for (const [n, b] of bytes.entries()) ups.push(await upload(b, `clip-${n}.mp3`));
    const fake = await upload(Buffer.from("words dressed up as a recording. ".repeat(80)), "fake.mp3");
    const voice = (items, words = {}) => ({ emma: { name: "Emma", locale: "nl-NL", about: "Recorded for the check", items, words } });
    const refused = await mcp("tools/call", { name: "set_pack_audio", arguments: { pack_id: "sound-check", voices: voice({ [one.id]: { upload_id: fake, seconds: 2, words: timings(one) } }) } });
    assert(refused.isError && /isn't an MP3/.test(refused.content[0].text), refused.content[0].text.slice(0, 300));
    const wrong = await mcp("tools/call", { name: "set_pack_audio", arguments: { pack_id: "sound-check", voices: voice({ [one.id]: { upload_id: ups[0], seconds: 2, words: [[0, 1]] } }) } });
    assert(wrong.isError && /words must give each of the sentence's/.test(wrong.content[0].text), wrong.content[0].text.slice(0, 300));
    // The second device's own poll is answered "nothing waiting" until the stage takes it: on a busy machine it could
    // otherwise take the change before the clip is checked as still served for it.
    const hold = (route) => route.fulfill({ status: 204 });
    await page2.route("**/api/packs/inbox*", hold);
    const set = await tool("set_pack_audio", {
      pack_id: "sound-check",
      voices: voice({ [one.id]: { upload_id: ups[0], seconds: 2, words: timings(one) }, [two.id]: { upload_id: ups[1], seconds: 2.2, words: timings(two) } }, { station: { upload_id: ups[2], seconds: 0.8 } }),
    });
    assert(set.said === "recorded 2 sentences and 1 word of Sound check" && set.clips === 3 && set.devices.length === 2, JSON.stringify(set));
    assert(set.warnings.some((w) => /reads 2 of the pack's 3 sentences/.test(w.message)), "it says what the device's own voice reads");
    const clipUrl = `/api/packs/changes/${set.change_id}/clips/${names[0]}`;
    assert((await status(page, clipUrl)) === 200, "served to your devices while on its way");
    // The first device takes it: its clips first, then the recordings, with a toast and Undo.
    await takeNow();
    await page.locator('[data-part="toast"]', { hasText: "recorded 2 sentences and 1 word of Sound check" }).waitFor();
    assert((await keptHere(page, names)).every(Boolean), "kept on the first device");
    assert((await status(page2, clipUrl)) === 200, "still served while the second device hasn't it");
    await page2.unroute("**/api/packs/inbox*", hold);
    await takeNow(page2);
    assert((await keptHere(page2, names)).every(Boolean), "kept on the second device");
    // Both have them: the server's copy is gone.
    assert((await status(page, clipUrl)) === 404, "gone from the server once both have it");
    const [audioChange] = await changes({ pack_id: "sound-check" });
    assert(audioChange.kind === "audio" && audioChange.devices.length === 2 && audioChange.devices.every((d) => d.state === "applied"), JSON.stringify(audioChange));
    // Offered and played on each device from its own copy (the address isn't on the server at all).
    for (const target of [page, page2]) {
      const audio = await offered(target);
      assert(audio?.voices?.emma?.name === "Emma" && Object.keys(audio.voices.emma.items).length === 2 && audio.voices.emma.words.station, JSON.stringify(audio).slice(0, 300));
      const played = await target.evaluate(async (id) => {
        const voice = await import("/js/study/voice.js");
        const item = (await import("/js/study/content.js")).ITEMS.find((i) => i.pack === "sound-check" && i.id.endsWith(id));
        const playing = voice.speakItem(item);
        for (let i = 0; i < 30 && !voice.playbackState().src.startsWith("blob:"); i++) await new Promise((r) => setTimeout(r, 100));
        const src = voice.playbackState().src;
        playing?.stop();
        return src;
      }, one.id);
      assert(played.startsWith("blob:"), `it played ${played}`);
    }
    assert((await status(page, `/api/packs/audio/${names[0]}`)) === 404, "the address a device keeps them under isn't served");
    const listed = await tool("get_pack", { pack_id: "sound-check" });
    assert(JSON.stringify(listed.recordings) === JSON.stringify([{ voice: "emma", name: "Emma", sentences: 2, words: 1 }]), JSON.stringify(listed.recordings));
    // Its page names the voice.
    await goSettings("#settings/study/packs/sound-check", "Its voices");
    await settingsPage().locator('[data-part="list-row"]', { hasText: "Keep Emma" }).waitFor();
    await shot("17a-your-recordings-voices");
    // Undo puts back what it had (none), on both.
    await tool("undo_pack_change", { change_id: set.change_id });
    await takeNow();
    await takeNow(page2);
    assert(!(await offered(page)) && !(await offered(page2)), "undone on both");
    // Recorded again (one sentence), then taken away with remove_pack_audio, on both.
    const again = await upload(bytes[0], "again.mp3");
    await tool("set_pack_audio", { pack_id: "sound-check", voices: voice({ [one.id]: { upload_id: again, seconds: 2, words: timings(one) } }) });
    await takeNow();
    await takeNow(page2);
    assert((await offered(page)) && (await offered(page2)), "recorded again on both");
    const removed = await tool("remove_pack_audio", { pack_id: "sound-check" });
    assert(removed.said === "took the recordings away from Sound check", JSON.stringify(removed));
    await takeNow();
    await takeNow(page2);
    assert(!(await offered(page)) && !(await offered(page2)), "taken away on both");
    // Recorded once more, then the pack deleted in the app: gone from both devices, its recordings with it.
    const last = await upload(bytes[1], "last.mp3");
    await tool("set_pack_audio", { pack_id: "sound-check", voices: voice({ [two.id]: { upload_id: last, seconds: 2.2, words: timings(two) } }) });
    await takeNow();
    await takeNow(page2);
    await goSettings("#settings/study/packs/sound-check", "Delete this pack");
    await settingsPage().locator('[data-part="list-row"]', { hasText: "Delete this pack" }).click();
    await settingsPage().locator('[data-part="list-row"]', { hasText: "Press again to delete it" }).click();
    await page.waitForFunction(() => location.hash === "#study/packs");
    await takeNow();
    await takeNow(page2);
    assert(!(await packHere("sound-check")) && !(await packHere("sound-check", page2)), "deleted on both");
    assert(!(await tool("list_packs")).yours.some((p) => p.pack_id === "sound-check"), "and from the account");
    return `refused a text dressed as an MP3 and wrong timings; ${set.clips} clips on both devices, then gone from the server; played from each device's copy; undone; recorded again and taken away; deleted with its recordings`;
  } finally {
    await second.close();
  }
});

await stage("deleting your AI's pack in the app takes it off the account too; what's left is as it was", async () => {
  const stale = await page.evaluate(async () => (await import("/js/study/packs.js")).yourPack("travel-check"));
  await goSettings("#settings/study/packs/travel-check", "Delete this pack");
  await settingsPage().locator('[data-part="list-row"]', { hasText: "Delete this pack" }).click();
  await settingsPage().locator('[data-part="list-row"]', { hasText: "Press again to delete it" }).click();
  await page.waitForFunction(() => location.hash === "#study/packs");
  await takeNow();
  // An older copy arriving late (a device that was offline) can't bring it back.
  const late = await page.evaluate(
    async ({ pack, device }) => (await fetch("/api/packs/copies/travel-check", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device, through: 1, pack }) })).status,
    { pack: stale.pack, device: await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).deviceId()) },
  );
  const left = await tool("list_packs");
  assert(late === 200 && !left.yours.some((p) => p.pack_id === "travel-check") && !(await packHere("travel-check")), JSON.stringify({ late, yours: left.yours.map((p) => p.pack_id) }));
  const ours = (await packsState()).yours.map(([id]) => id).join();
  assert(ours === "check-nl,check-de", `the device's own packs: ${ours}`);
  return `gone from the device and the account; left: ${left.yours.map((p) => p.pack_id).join(", ")}`;
});

// ---------- public packs from the open library ----------

const scratch = mkdtempSync(join(tmpdir(), "packs-check-"));
const wrangler = (args) => execFileSync("npx", ["wrangler", ...args, "--local", "--persist-to", PERSIST], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
// The library's bucket through one local R2 in this process (scripts/fixtures/local-r2.mjs), not a wrangler launch per object.
const r2 = localR2(APP, PERSIST);
const libraryGet = (key) => r2.getText("lexicommons-library", key);
const libraryPut = (key, text) => r2.put("lexicommons-library", key, text, "application/json");

const d1 = (command) => wrangler(["d1", "execute", "lexicommons", "--command", command]);
const seed = (file, ...flags) => execFileSync("node", [join(APP, "scripts/packs/seed-local.mjs"), file, "--persist-to", PERSIST, ...flags], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sync = (target = page) => target.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
const libraryState = (target = page) =>
  target.evaluate(async () => {
    const p = await import("/js/study/packs.js");
    return { library: p.libraryPacks(), problems: p.packProblems() };
  });
const STARTER_IDS = BUILT_IN[0].items.map((item) => item.id);
const originalCatalogue = await libraryGet("catalogue.json");
const v1 = await packVersion(checkPack(BUILT_IN[0]).pack);
const starterV2 = structuredClone(BUILT_IN[0]);
starterV2.items[0].means = "Yesterday I read a book.";
starterV2.items.push({
  id: "vanavond-oma",
  topic: "people",
  concepts: ["v2"],
  words: [["Vanavond", "vanavond"], ["eten", "eten"], ["we"], ["bij"], ["oma", "oma"]],
  punct: ".",
  literal: [["Tonight"], ["eat", true], ["we"], ["at grandma's"]],
  english: [0, 2, 1, 3],
  moved: ["eten"],
  means: "Tonight we're eating at Grandma's.",
  wrong: ["Vanavond we eten bij oma.", "We vanavond eten bij oma."],
  gap: { index: 1, options: ["eten", "eet", "at"] },
});
const v2 = await packVersion(checkPack(starterV2).pack);

await stage("Lexicommons' own packs come from the open library: the starter's copy arrives and takes the app's place", async () => {
  const before = (await view()).packs.find((p) => p.id === "starter-word-order");
  // The app's own copy on a fresh state; on a state with a copy of the live library, already the library's.
  assert(before.origin?.kind === "app" || before.origin?.kind === "default", `before: ${JSON.stringify(before.origin)}`);
  const out = seed(join(APP, "public/js/packs/starter-word-order.js"));
  assert(out.includes(`starter-word-order@${v1}`), out);
  const result = await sync();
  // Explore registers the account's follow list (setFollowsSource): an account that follows nothing reads as 0; with no
  // source registered it's null.
  assert(result.ok && result.defaults === 1 && (result.follows === null || result.follows === 0) && !result.problems.length, JSON.stringify(result));
  const { library } = await libraryState();
  assert(library.some((p) => p.id === "starter-word-order" && p.kind === "default" && p.version === v1), JSON.stringify(library));
  const v = await view();
  const starter = v.packs.find((p) => p.id === "starter-word-order");
  assert(starter.origin.kind === "default" && starter.origin.version === v1 && starter.builtIn, JSON.stringify(starter));
  assert(v.items.slice(0, 13).map((i) => i.id).join() === STARTER_IDS.join(), "the starter's ids changed");
  return `starter@${v1} from the library (the account's follow list: ${result.follows === null ? "no source" : "empty"})`;
});

await stage("a library pack's recordings: they come with it, each sentence plays its pack's own from the library, kept for offline, credited on its page", async () => {
  // The starter's own recordings as the library takes them (version 2, named by their bytes), made here from the app's.
  const made = join(scratch, "starter-audio");
  execFileSync("node", [join(APP, "scripts/packs/audio-v2.mjs"), join(APP, "public/audio/starter-word-order"), "--pack", join(APP, "public/js/packs/starter-word-order.js"), "--out", made, "--license", "For the check only", "--credit", "{name}, a voice for the check"], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  const out = seed(join(APP, "public/js/packs/starter-word-order.js"), "--audio", join(made, "manifest.json"), "--clips", join(made, "clips"));
  assert(/recordings: 2 voice\(s\), \d+ clips/.test(out), out);
  const result = await sync();
  assert(result.ok && !result.problems.length, JSON.stringify(result));
  const held = await page.evaluate(async () => {
    const audio = (await import("/js/study/packs.js")).packAudio("starter-word-order");
    return audio ? Object.entries(audio.voices).map(([slug, v]) => [slug, v.credit, v.license, Object.keys(v.items).length]) : null;
  });
  assert(held?.length === 2 && held.every(([, credit, license, items]) => credit.endsWith("a voice for the check") && license === "For the check only" && items >= 13), JSON.stringify(held));
  // A sentence plays its pack's recording from the library, and the clip is kept on the device.
  const played = await page.evaluate(async () => {
    const voice = await import("/js/study/voice.js");
    const item = (await import("/js/study/content.js")).ITEMS.find((i) => i.id === "boek-gelezen");
    const playing = voice.speakItem(item);
    await new Promise((r) => setTimeout(r, 400));
    const src = voice.playbackState().src;
    playing?.stop();
    return src;
  });
  const clip = new URL(played).pathname;
  assert(/^\/library\/audio\/[0-9a-f]{16}\.mp3$/.test(clip), `it played ${played}`);
  const kept = await page.evaluate(async (path) => {
    for (let i = 0; i < 50; i++) {
      if (await (await caches.open("lx-audio-v1")).match(path)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }, clip);
  assert(kept, "the clip wasn't kept");
  // Offline, the kept copy plays.
  offline = true;
  await context.setOffline(true);
  try {
    const offline = await page.evaluate(async () => {
      const voice = await import("/js/study/voice.js");
      const item = (await import("/js/study/content.js")).ITEMS.find((i) => i.id === "boek-gelezen");
      const playing = voice.speakItem(item);
      for (let i = 0; i < 30 && !voice.playbackState().src.startsWith("blob:"); i++) await new Promise((r) => setTimeout(r, 100));
      const src = voice.playbackState().src;
      playing?.stop();
      return src;
    });
    assert(offline.startsWith("blob:"), `offline it played ${offline}`);
    // Stopped before the kept copy is found: nothing starts later (no sound playing that nothing can stop).
    const ghost = await page.evaluate(async () => {
      const voice = await import("/js/study/voice.js");
      const item = (await import("/js/study/content.js")).ITEMS.find((i) => i.id === "boek-gelezen");
      voice.speakItem(item)?.stop();
      await new Promise((r) => setTimeout(r, 600));
      return voice.playbackState();
    });
    assert(ghost.paused, `a stopped sound played anyway: ${JSON.stringify(ghost)}`);
  } finally {
    await context.setOffline(false);
    // Requests already failing as it comes back online are still logged a moment later.
    await page.waitForTimeout(500);
    offline = false;
  }
  // Followed from Explore (here while learning German, so it's a follow rather than one of the language's own): its
  // recordings come with the follow list's ref (explore.js's follows source passes `audio`) and stay through syncs.
  const entry = JSON.parse(await libraryGet("catalogue.json")).packs.nl.find((e) => e.id === "starter-word-order");
  assert(entry?.audio, JSON.stringify(entry));
  await page.route("**/api/community/following", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: entry.id, version: entry.version, url: entry.url, audio: entry.audio, corrections: "published" }]) }));
  await setLearning("de");
  try {
    await sync();
    await sync();
    const kept = await page.evaluate(async () => Boolean((await import("/js/study/packs.js")).packAudio("starter-word-order")));
    assert(kept, "a sync dropped a followed pack's recordings");
  } finally {
    await page.unroute("**/api/community/following");
    await setLearning("nl");
  }
  // Its page names each voice with its credit and license, a press away: About its voices opens them in a sheet.
  await goSettings("#settings/study/packs/starter-word-order", "Its voices");
  await settingsPage().locator('[data-part="list-row"]', { hasText: "About its voices" }).first().click();
  const credits = page.locator('[data-part="sheet"]:not([hidden]) .lx-sheet-words p', { hasText: "a voice for the check" });
  await credits.first().waitFor();
  const lines = await credits.allTextContents();
  assert(lines.length === 2 && lines.every((line) => line.includes("For the check only")), `About its voices: ${JSON.stringify(lines)}`);
  await shot("06a-library-recordings-credited");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[data-part="sheet"]:not([hidden]) .lx-sheet-words'));
  // Taken off the catalog entry: the device drops them, and the recordings inside the app play again.
  seed(join(APP, "public/js/packs/starter-word-order.js"), "--drop-audio");
  await sync();
  const after = await page.evaluate(async () => {
    const voice = await import("/js/study/voice.js");
    const dropped = (await import("/js/study/packs.js")).packAudio("starter-word-order") === null;
    const item = (await import("/js/study/content.js")).ITEMS.find((i) => i.id === "boek-gelezen");
    const playing = voice.speakItem(item);
    await new Promise((r) => setTimeout(r, 300));
    const src = voice.playbackState().src;
    playing?.stop();
    return { dropped, src };
  });
  assert(after.dropped && new URL(after.src).pathname.startsWith("/audio/starter-word-order/"), JSON.stringify(after));
  return `${held.length} voices from the library, ${clip} played and kept, offline from the kept copy, credited; dropped again`;
});

await stage("a new version of a public pack reaches the device, and your progress on it carries on", async () => {
  const progressBefore = await page.evaluate(async () => {
    const p = await import("/js/study/progress.js");
    p.record([{ concept: "p:perfect", skill: "read", outcome: "right", test: "build", activity: "check", item: "boek-gelezen" }]);
    return { perfect: p.unitState("p:perfect").reviews, item: p.itemEvidence("boek-gelezen").length, rows: p.allEvidence().length };
  });
  writeFileSync(join(scratch, "starter-v2.json"), JSON.stringify(starterV2));
  const out = seed(join(scratch, "starter-v2.json"));
  assert(out.includes(`from ${v1}: 1 added, 1 changed, 0 removed, 12 kept`) && out.includes(`starter-word-order@${v2}`), out);
  const result = await sync();
  assert(result.ok && !result.problems.length, JSON.stringify(result));
  const v = await view();
  const starterItems = v.items.filter((i) => i.pack === "starter-word-order");
  assert(starterItems.length === 14 && starterItems.at(-1).id === "vanavond-oma", starterItems.map((i) => i.id).join());
  assert(v.items.find((i) => i.id === "boek-gelezen").means === "Yesterday I read a book.", "the changed sentence");
  const progressAfter = await page.evaluate(async () => {
    const p = await import("/js/study/progress.js");
    return { perfect: p.unitState("p:perfect").reviews, item: p.itemEvidence("boek-gelezen").length, rows: p.allEvidence().length };
  });
  assert(JSON.stringify(progressAfter) === JSON.stringify(progressBefore), `${JSON.stringify(progressBefore)} → ${JSON.stringify(progressAfter)}`);
  await toStudy();
  await shot("06-starter-v2-from-library", { fullPage: true });
  return `${v1} → ${v2}: 14 sentences; progress the same (${JSON.stringify(progressAfter)})`;
});

await stage("a file that doesn't match its version is refused, and the copy here stays as it was", async () => {
  const fake = "abcdefabcdef";
  const tampered = checkPack(starterV2).pack;
  tampered.items[1].means = "Tomorrow we go to grandma's, says a stranger.";
  await libraryPut(packKey("starter-word-order", fake), packText(tampered));
  await libraryPut("catalogue.json", JSON.stringify(withPackEntry(JSON.parse(await libraryGet("catalogue.json")), "nl", catalogueEntry(tampered, fake)), null, 2));
  const result = await sync();
  assert(result.problems.some((p) => p.message.includes("doesn't match its version")), JSON.stringify(result));
  const { library, problems } = await libraryState();
  assert(problems.some((p) => p.id === "library:starter-word-order"), JSON.stringify(problems));
  assert(library.find((p) => p.id === "starter-word-order").version === v2, "the copy here changed");
  const v = await view();
  assert(!v.items.some((i) => i.means.includes("stranger")), "the tampered sentence is in studying");
  // Put the real v2 back, and the refusal clears.
  seed(join(scratch, "starter-v2.json"));
  await sync();
  const after = await libraryState();
  assert(!after.problems.length, JSON.stringify(after.problems));
  return "refused: its content doesn't match its version; v2 kept, then listed again";
});

await stage("following a public pack: it's here at once, survives a sync, and goes when you stop", async () => {
  const followed = checkPack({ ...NL, id: "follow-nl", name: "A pack you follow (Dutch)" }, { installed: [{ ...BUILT_IN[0], builtIn: true }] }).pack;
  const version = await packVersion(followed);
  await libraryPut(packKey("follow-nl", version), packText(followed));
  // In Explore it's an item with this version on record, as every pack you can follow is: the library serves a shared
  // pack's file only then (books.ts).
  const now = Date.now();
  d1(
    `INSERT OR REPLACE INTO items (id, kind, owner_id, curated, title, language, from_lang, licence, head_version, content_hash, search, created_at, updated_at) VALUES ('follow-nl', 'pack', NULL, 0, 'A pack you follow (Dutch)', 'nl', 'en', 'CC BY-SA 4.0', '${version}', 'packs-check-follow-nl', 'a pack you follow dutch', ${now}, ${now}); ` +
      `INSERT OR REPLACE INTO item_versions (item_id, version, seq, r2_key, bytes, summary, licence, made_by, created_at) VALUES ('follow-nl', '${version}', 1, '${packKey("follow-nl", version)}', ${packText(followed).length}, '{}', 'CC BY-SA 4.0', 'packs-check', ${now})`,
  );
  const ref = { id: "follow-nl", version, url: packUrl("follow-nl", version) };
  const bad = await page.evaluate(async (r) => (await import("/js/study/packs.js")).followPack(r), { ...ref, url: "https://elsewhere.example/pack.json" });
  assert(!bad.ok, "a ref pointing elsewhere was followed");
  const result = await page.evaluate(async (r) => (await import("/js/study/packs.js")).followPack(r), ref);
  assert(result.ok, JSON.stringify(result));
  let v = await view();
  const pack = v.packs.find((p) => p.id === "follow-nl");
  assert(pack?.origin.kind === "follow" && pack.on && !pack.builtIn, JSON.stringify(pack));
  assert(v.items.some((i) => i.id === "follow-nl/balletje"), "its sentences");
  // The account's follow list can't be read (here: an answer that isn't a list, so no request error is logged): a sync
  // leaves what's followed as it is.
  await page.route("**/api/community/following", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"not":"a list"}' }));
  await sync();
  assert((await view()).packs.some((p) => p.id === "follow-nl"), "a sync dropped it while the follow list can't be read");
  await page.unroute("**/api/community/following");
  await page.evaluate(async () => (await import("/js/study/packs.js")).unfollowPack("follow-nl"));
  v = await view();
  assert(!v.packs.some((p) => p.id === "follow-nl") && !v.items.some((i) => i.pack === "follow-nl"), "still here after unfollowing");
  d1("DELETE FROM items WHERE id = 'follow-nl'");
  return `follow-nl@${version}: followed, kept through a sync, unfollowed`;
});

await stage("a first start offline: the starter inside the app, then the library's once it's reachable", async () => {
  const offline = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const other = await offline.newPage();
  // Its console, but for the library requests this stage blocks on purpose.
  other.on("console", (m) => m.type() === "error" && !/ERR_INTERNET_DISCONNECTED/.test(m.text()) && problems.push(`offline page console: ${m.text()}`));
  other.on("pageerror", (e) => problems.push(`offline page error: ${e.message}`));
  const otherCdp = await offline.newCDPSession(other);
  await otherCdp.send("WebAuthn.enable");
  await otherCdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  // The library can't be reached (the rest of the app can, so the account can be made).
  await other.route("**/library/**", (route) => route.abort("internetdisconnected"));
  await other.goto(`${BASE}/app/`);
  await other.waitForURL(/\/login\?next=/);
  await other.click("summary");
  await other.fill('input[name="name"]', "Packs Check Offline");
  await other.click('#register button[type="submit"]');
  await other.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await other.waitForSelector("html[data-app-ready]");
  const offlineResult = await sync(other);
  const first = await other.evaluate(async () => {
    const c = await import("/js/study/content.js");
    return { ids: c.ITEMS.map((i) => i.id), origin: c.PACKS.find((p) => p.id === "starter-word-order").origin };
  });
  assert(!offlineResult.ok && first.origin.kind === "app" && first.ids.join() === STARTER_IDS.join(), JSON.stringify({ offlineResult, first }));
  await other.unroute("**/library/**");
  const online = await sync(other);
  const then = await other.evaluate(async () => {
    const c = await import("/js/study/content.js");
    return { count: c.ITEMS.length, origin: c.PACKS.find((p) => p.id === "starter-word-order").origin };
  });
  assert(online.ok && then.origin.kind === "default" && then.origin.version === v2 && then.count === 14, JSON.stringify({ online, then }));
  await other.goto(`${BASE}/app/#settings/account`);
  await other.locator('[data-part="list-row"]', { hasText: "Delete my account" }).click();
  await other.locator('[data-part="list-row"]', { hasText: "Press again to delete it for good" }).click();
  await other.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  await offline.close();
  return `offline: the app's starter (13); online: ${v2} from the library (14); that account deleted`;
});

await stage("the local library is put back as it was found", async () => {
  if (originalCatalogue === null) await r2.remove("lexicommons-library", "catalogue.json");
  else await libraryPut("catalogue.json", originalCatalogue);
  assert(await libraryGet("catalogue.json") === originalCatalogue, "the catalog differs from the one found");
  return originalCatalogue === null ? "no catalog, as before" : "the catalog as found";
});

await stage("export has your packs; deleting the account deletes them from the device", async () => {
  await page.goto(`${BASE}/app/#settings/data`);
  await page.waitForSelector('[data-part="list-row"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator('[data-part="list-row"]', { hasText: "Download everything" }).click()]);
  const file = JSON.parse(readFileSync(await download.path(), "utf8"));
  assert(file.device.packs.map((p) => p.id).join() === "check-nl,check-de" && Array.isArray(file.device.packsOff), JSON.stringify(file.device.packs.map((p) => p.id)));
  // Deleting the account is Account's alone (Settings, 6 Nov).
  await page.goto(`${BASE}/app/#settings/account`);
  await page.locator('[data-part="list-row"]', { hasText: "Delete my account" }).click();
  await page.locator('[data-part="list-row"]', { hasText: "Press again to delete it for good" }).click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  const left = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("lexicommons-packs", 1);
        open.onsuccess = () => {
          const request = open.result.transaction("packs").objectStore("packs").count();
          request.onsuccess = () => resolve(request.result);
        };
      }),
  );
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("lx.")));
  assert(left === 0 && keys.length === 0, `packs left: ${left}, keys: ${keys}`);
  return "exported 2 packs; none left after the delete";
});

await stage("no stray \"null\" or \"undefined\" text on any screen shot", async () => {
  assert(!strayText.length, `stray text: ${strayText.slice(0, 5).join(" · ")}`);
  return "none";
});

await stage("no console errors", async () => {
  const real = problems.filter((p) => !/status of 401/.test(p));
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "packs-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems, warnings }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
