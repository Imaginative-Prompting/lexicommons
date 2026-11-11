// Today's Translate with the Dutch word packs (packs/words-nl-*.json, one sentence written for every word), as a phone
// sees it. First a first open while the packs download (held) and the server's Translate is slow (3 s, as a cold one):
// within 1 s of typing, a result or the loading line; a line saying the packs are downloading; hi found online
// meanwhile; once they're here, searched again on this device's copy (the server gone by then). Then: an English word typed ("hi") gives the Dutch words it means first, then up to 6 sentences, each word's own
// sentence (the one written for it: its gap is that word) before the rest (6, or as many as the packs have); a Dutch word, and a form of one, the same
// way back; a word from each pack given, its own sentence first; me, him, her, us and them each finding their Dutch
// word; several words, up to 4 main words with 2 sentences each; offline, the device's
// copy of the packs alone. With --opt-in (the strong
// language pack, an opt-in pack of Lexicommons' own): no device has it until its learner adds it, Translate online
// finds its words all the same, and once it's added in Explore it's on the device, offline too, credited to
// Lexicommons. What it expects is read from the pack files themselves. LOCAL only: it signs up a test account (deleted
// at the end), writes an admin into the local D1 (to bring Explore's index of the library up to date; deleted at the
// end), and the local library must have the packs (scripts/packs/seed-local.mjs <pack.json> --persist-to <dir>, the
// opt-in one with --opt-in).
// Usage: node scripts/words-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --pack <packs/words-nl-01.json>
//        [--pack …] [--opt-in <packs/words-nl-strong.json>]   (exit 0 = pass; 2 = the local library hasn't got them)
import { chromium } from "./quiet-browser.mjs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PACKS = argv.flatMap((arg, i) => (argv[i - 1] === "--pack" ? [JSON.parse(readFileSync(resolve(arg), "utf8"))] : []));
const OPT_IN = argv.includes("--opt-in") ? JSON.parse(readFileSync(resolve(argv[argv.indexOf("--opt-in") + 1]), "utf8")) : null;
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PACKS.length || !PERSIST) {
  console.error("Usage: node scripts/words-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --pack <packs/words-nl-01.json> [--opt-in <pack>] (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// The library must list every pack given as a Dutch default pack, or there's nothing here to check.
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
const entries = new Map((catalogue.packs?.nl ?? []).map((p) => [p.id, p]));
const absent = [...PACKS.filter((p) => !entries.has(p.id) || entries.get(p.id).optIn).map((p) => `${p.id} (as a default)`), ...(OPT_IN && entries.get(OPT_IN.id)?.optIn !== true ? [`${OPT_IN.id} (as opt-in)`] : [])];
if (absent.length) {
  console.error(`words-check: the local library doesn't list ${absent.join(", ")}; seed them with scripts/packs/seed-local.mjs first.`);
  process.exit(2);
}
// An admin, written into the local D1, brings Explore's index of the library in line with the catalog (seed-local
// writes the catalog directly): one library call with an admin-access token. Deleted at the end.
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
const curator = { id: `wc${randomBytes(6).toString("hex")}`, token: `lct_${randomBytes(24).toString("base64url")}` };
const now = Date.now();
sql(
  [
    `INSERT INTO users (id, name, created_at) VALUES (${q(curator.id)}, 'Words Check Curator', ${now})`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(curator.id)}, 'words-check', ${q(createHash("sha256").update(curator.token).digest("hex"))}, ${q(curator.token.slice(0, 10))}, ${now}, 1)`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(curator.id)}, 'admin', ${now}, 'd1', 'words-check')`,
  ].join("; "),
);
const synced = await fetch(`${BASE}/api/v1/admin/library`, { headers: { Authorization: `Bearer ${curator.token}` } });
if (!synced.ok) {
  console.error(`words-check: Explore's index couldn't be brought up to date (${synced.status}).`);
  process.exit(2);
}

// What the packs say, to expect: each word's own sentence (its gap's word), its gloss, and its forms.
const sentenceOf = (item) => item.words.map(([t]) => t).join(" ") + (item.punct ?? "");
const own = new Map();
const glosses = new Map();
for (const pack of PACKS) {
  // (A path's lessons give a word many sentences of its own: a word pack's sentence is the one that's its own.)
  for (const item of pack.lessons ? [] : pack.items) {
    const lemma = item.words[item.gap.index]?.[1];
    if (lemma && !own.has(lemma)) own.set(lemma, { text: sentenceOf(item), form: item.words[item.gap.index][0].replace(/[^\p{L}\p{M}'’-]+$/u, ""), pack: pack.id });
  }
  for (const [lemma, gloss] of Object.entries(pack.words)) if (!glosses.has(lemma)) glosses.set(lemma, gloss);
}
// A word as the language writes it (study/written.js, decided from the same pack files: IJslands, Engels), which is what Translate shows
// for a key; each word read off the page is taken back to its key (lemma) to compare with what the packs say.
const written = await import(new URL("../public/js/study/written.js", import.meta.url));
const tally = written.writingTally("nl");
for (const pack of PACKS) for (const item of pack.items ?? []) if (Array.isArray(item.words)) tally.add(item.words);
const forms = written.writtenForms([tally.done()], "nl");
const shown = (lemma) => forms.get(lemma) ?? lemma;
const byShown = new Map([...forms].map(([lemma, form]) => [form, lemma]));
const keyOf = (said) => byShown.get(said) ?? said;
// How many sentences the packs have for some lemmas: what Translate can show (up to 6 for one thing typed).
const withAny = (lemmas) => new Set(PACKS.flatMap((pack) => pack.items.filter((item) => item.words.some(([, l]) => lemmas.includes(l))).map(sentenceOf))).size;
const glossesWith = (english) => [...glosses].filter(([, gloss]) => gloss.replace(/\([^)]*\)/g, " ").split(/[,;/]|\bor\b/).some((part) => part.trim().replace(/^(?:to|the|a|an) /, "") === english)).map(([lemma]) => lemma);

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
async function stage(name, fn) {
  try {
    results[name] = { ok: true, note: (await fn()) ?? "" };
    console.log(`PASS ${name}: ${results[name].note}`);
  } catch (error) {
    failed++;
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${Object.keys(results).length}.png` }).catch(() => {});
  }
}

// The first open, as a phone sees it on a slow connection after a band is published: Lexicommons' packs held back
// (until the first stage lets them go; context.route, so the service worker's fetches are held too), and the server's
// Translate slow, as a cold one is while it builds its index from the library (3 s). `online` is how it answers:
// "slow", "now" or "down" (refused, as when the server can't be reached).
let letPacksGo;
const packsHeld = new Promise((resolve) => (letPacksGo = resolve));
let packsAsked = 0;
let online = "slow";
await context.route("**/library/packs/**/pack.json", async (route) => {
  packsAsked++;
  await packsHeld;
  await route.continue().catch(() => {});
});
await context.route((url) => url.pathname === "/api/translate", async (route) => {
  if (online === "down") return route.abort().catch(() => {});
  if (online === "slow") await new Promise((r) => setTimeout(r, 3000));
  await route.continue().catch(() => {});
});

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Words Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
await page.waitForSelector("html[data-app-ready]");

/** Today, from anywhere: on Translate's page its tabs are away. */
async function backToToday() {
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-translate") && document.querySelector('[data-part="translate-field"] textarea'));
}

/** Types into Today's Translate and waits for what it draws, with what the packs have under the answer: { words: [{ said, meaning }], sentences, note, packs, button }. */
async function typed(text) {
  const field = page.locator('[data-part="translate-field"] textarea');
  await field.fill("");
  await field.fill(text);
  const want = text.trim();
  // Poll inside the page until the results are this query's and settled (the same for 600 ms). What the packs have with it is under the
  // answer ("In your packs", .lx-tr-inline): its sentences, its other words and its credits, read in place.
  const found = await page.evaluate(async (want) => {
    const read = () => {
      const box = document.querySelector(".lx-tr-results");
      if (!box || !box.children.length) return null;
      const source = document.querySelector(".lx-tr-source");
      const inline = box.querySelector(".lx-tr-inline");
      const result = (r) => ({ said: r.querySelector(".lx-tr-said")?.textContent ?? "", meaning: r.querySelector(".lx-tr-meaning")?.textContent ?? "" });
      const top = [...box.querySelectorAll('[data-part="translate-result"]')].filter((r) => !inline?.contains(r)).map(result);
      const seen = new Set(top.map((w) => w.said));
      const more = inline ? [...inline.querySelectorAll('[data-part="translate-result"]:not([data-variant="sentence"])')].map(result).filter((w) => !seen.has(w.said)) : [];
      return {
        words: [...top, ...more],
        sentences: inline ? [...inline.querySelectorAll('[data-part="sentence-row"]')].map((row) => row.textContent.trim()) : [],
        empty: Boolean(box.querySelector(".lx-tr-none")),
        note: [...box.querySelectorAll("p")].filter((p) => !inline?.contains(p)).map((p) => p.textContent).concat(source && !source.hidden ? source.textContent : []).concat(inline?.querySelector('[data-part="credit"]')?.textContent ?? []).join(" | "),
        packs: Boolean(inline),
        button: box.querySelector('[data-part="translate-more"]')?.textContent ?? null,
      };
    };
    let last = null;
    let same = 0;
    for (let waited = 0; waited < 15_000; waited += 100) {
      await new Promise((r) => setTimeout(r, 100));
      const input = document.querySelector('[data-part="translate-field"] textarea');
      const now = input?.value.trim() === want ? read() : null;
      const key = JSON.stringify(now);
      same = now && key === JSON.stringify(last) ? same + 100 : 0;
      last = now;
      // The server's answer standing in while this device's index is made (data-indexing) isn't settled: the device's own are to come.
      if (now && same >= 600 && !document.querySelector(".lx-today-translate[data-indexing]")) break;
    }
    return last;
  }, want);
  return found && { ...found, words: found.words.map((w) => ({ ...w, lemma: keyOf(w.said) })) };
}
const starts = (row, text) => row.startsWith(text.replace(/[.?!]$/, ""));

// The default packs the server reads: the catalog's first three (src/translate.ts, ownDefaults; a local library may have no starter).
const SERVER_READS = new Set([...entries.values()].filter((entry) => !entry.optIn).slice(0, 3).map((entry) => entry.id));
// A word that only a band past the ones the server reads has, and no gloss of those says.
const LATER = (() => {
  const read = [...PACKS.filter((p) => SERVER_READS.has(p.id)), ...(OPT_IN ? [OPT_IN] : [])];
  const early = new Set(read.flatMap((p) => Object.keys(p.words ?? {})));
  const glossed = new Set(read.flatMap((p) => Object.values(p.words ?? {}).flatMap((gloss) => String(gloss).toLowerCase().split(/[^\p{L}]+/u))));
  for (const pack of PACKS.filter((p) => !SERVER_READS.has(p.id))) {
    const word = pack.items.map((item) => item.words[item.gap?.index ?? -1]?.[1]).find((lemma) => lemma && /^\p{Ll}{8,}$/u.test(lemma) && !early.has(lemma) && !glossed.has(lemma));
    if (word) return { word, pack: pack.id };
  }
  return null;
})();
await stage("a first open while Lexicommons' packs download (held) and the server's Translate is slow (3 s): within 1 s of typing hi, Translate is looking; it says the packs are downloading; it finds hi online meanwhile; once they're here, it searches again, on this device's copy", async () => {
  await backToToday();
  // The hold holds: the packs were asked for, and none is on the device.
  const ids = PACKS.map((p) => p.id);
  const here = () => page.evaluate(async (ids) => (await import("/js/study/packs.js")).libraryPacks().filter((p) => ids.includes(p.id)).map((p) => p.id), ids);
  for (let waited = 0; !packsAsked && waited < 15_000; waited += 100) await page.waitForTimeout(100);
  assert(packsAsked > 0, "the app never asked for Lexicommons' packs: nothing to hold");
  assert(!(await here()).length, `packs on the device while they're held: ${await here()}`);
  await page.locator('[data-part="translate-field"] textarea').fill("hi");
  // Within 1 s of typing: what it found, or that it's looking (ui.loadingState), never nothing.
  const first = await page.evaluate(async () => {
    const t0 = performance.now();
    for (;;) {
      const at = Math.round(performance.now() - t0);
      if (document.querySelector('.lx-tr-results [data-part="translate-result"]')) return { what: "results", at };
      const loading = document.querySelector('.lx-today-translate [data-part="looking-up"]');
      if (loading?.checkVisibility() && loading.textContent.trim()) return { what: `looking: ${loading.textContent.trim()}`, at };
      if (at > 1000) return { what: "nothing", at, shown: document.querySelector(".lx-today-translate")?.textContent.trim() ?? "" };
      await new Promise((r) => setTimeout(r, 25));
    }
  });
  assert(first.what !== "nothing", `nothing 1 s after typing hi: ${JSON.stringify(first)}`);
  await page.screenshot({ path: `${OUT}/00-first-open-looking.png`, fullPage: true });
  const line = page.locator(".lx-today-translate [role=status]", { hasText: "Getting the word packs" }).first();
  await line.waitFor({ timeout: 2000 }).catch(() => {});
  const said = (await line.count()) ? await line.textContent() : null;
  assert(said && new RegExp(`Getting the word packs \\(0 of ${PACKS.length}\\)`).test(said), `no line saying the packs are downloading: ${said ?? "none"}`);
  // Online meanwhile: hi's Dutch words from Lexicommons' packs on the server, with the packs still held.
  const expected = glossesWith("hi").slice(0, 3);
  const meanwhile = await typed("hi");
  const words = (meanwhile?.words ?? []).map((w) => w.lemma);
  assert(expected.every((lemma) => words.includes(lemma)), `online, meanwhile: ${JSON.stringify(meanwhile)}; expected ${expected.join(", ")}`);
  assert(!(await here()).length, "the packs arrived while held");
  await page.screenshot({ path: `${OUT}/00-first-open-online.png`, fullPage: true });
  // A word only a later band has: the server leaves those packs to the device, and the device hasn't got them yet, so it never
  // says the word isn't in Lexicommons.
  if (LATER) {
    await page.locator('[data-part="translate-field"] textarea').fill(LATER.word);
    const box = page.locator(".lx-today-translate");
    const shown = await page.evaluate(async () => {
      for (let waited = 0; waited < 12_000; waited += 100) {
        const text = document.querySelector(".lx-today-translate")?.innerText ?? "";
        if (/Not found yet|Not in Lexicommons yet/.test(text)) return text;
        await new Promise((r) => setTimeout(r, 100));
      }
      return document.querySelector(".lx-today-translate")?.innerText ?? "";
    });
    assert(/Not found yet/.test(shown) && !/Not in Lexicommons yet/.test(shown), `"${LATER.word}", in ${LATER.pack}, typed before it's here: ${shown.slice(0, 300)}`);
    await page.screenshot({ path: `${OUT}/00-first-open-later-band.png`, fullPage: true });
    assert(await box.count(), "the page went");
    await typed("hi");
  }
  // Then the server goes away, the packs come, and Translate searches again by itself: this device's copy answers.
  online = "down";
  letPacksGo();
  await line.waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
  const gone = !(await line.count());
  // The server's gone, so what's shown now is this device's own.
  const again = await page.evaluate(async () => {
    for (let waited = 0; waited < 15_000; waited += 100) {
      const box = document.querySelector(".lx-tr-results");
      if (box && !document.querySelector('.lx-today-translate [role=status]')?.textContent.includes("Getting the word packs") && box.querySelector('[data-part="translate-result"]')) return [...box.querySelectorAll('[data-part="translate-result"] .lx-tr-said')].map((n) => n.textContent);
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  });
  online = "now";
  assert(gone, "the downloading line stayed after the packs came");
  // The page shows one answer now (its other words under it, in place): it's one of hi's, from this device.
  assert(again && expected.some((lemma) => again.map(keyOf).includes(lemma)), `not searched again on this device's copy once the packs came: ${JSON.stringify(again)}`);
  assert((await here()).length === PACKS.length, `on the device: ${await here()}`);
  await page.screenshot({ path: `${OUT}/00-first-open-device.png`, fullPage: true });
  return `${first.what} at ${first.at} ms; "${said}"; online meanwhile ${words.join(", ")}; then this device's ${again.join(", ")}`;
});

if (LATER) {
  await stage("the server reads the first default packs and the opt-in one, and names the rest; a word of a later band comes from this device's copy", async () => {
    const asked = await page.evaluate(async (word) => {
      const response = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: word, from: "nl", to: "en" }) });
      return { timing: response.headers.get("server-timing"), body: await response.json() };
    }, LATER.word);
    const bytes = Number(/bytes;desc="(\d+)"/.exec(asked.timing ?? "")?.[1] ?? NaN);
    assert(bytes > 0 && bytes <= 8_000_000, `the server read ${bytes} bytes: ${asked.timing}`);
    assert(!asked.body.words?.length, `the server shouldn't have ${LATER.word}: ${JSON.stringify(asked.body.words).slice(0, 200)}`);
    const unread = PACKS.filter((p) => !SERVER_READS.has(p.id)).map((p) => p.id);
    assert(unread.every((id) => asked.body.notSearched?.includes(id)), `notSearched: ${asked.body.notSearched}, expected ${unread}`);
    const result = await typed(LATER.word);
    assert(result?.words?.length, `"${LATER.word}", in ${LATER.pack}, not found with every pack on this device: ${JSON.stringify(result)}`);
    return `${bytes} bytes read; ${asked.body.notSearched.length} packs named; "${LATER.word}" from this device: ${result.words.map((w) => w.said).join(", ")}`;
  });
}

// Whatever became of that stage, the packs go and the server answers at once from here on.
letPacksGo();
online = "now";

await stage("the device has the word packs from the library", async () => {
  const ids = await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    await packs.syncLibraryPacks();
    return packs.libraryPacks().filter((p) => p.language === "nl").map((p) => p.id);
  });
  const missing = PACKS.filter((p) => !ids.includes(p.id)).map((p) => p.id);
  assert(!missing.length, `not on the device: ${missing.join(", ")} (has ${ids.join(", ")})`);
  return ids.join(", ");
});

await stage("English → Dutch, one word (hi): its Dutch words first, then 6 sentences, each word's own first", async () => {
  await backToToday();
  const expected = glossesWith("hi");
  assert(expected.length, "no pack word is glossed hi: nothing to check");
  const found = await typed("hi");
  await page.screenshot({ path: `${OUT}/01-hi.png`, fullPage: true });
  assert(found && !found.empty, `nothing found: ${JSON.stringify(found)}`);
  const said = found.words.map((w) => w.lemma);
  assert(expected.slice(0, 3).every((lemma) => said.includes(lemma)), `words ${JSON.stringify(found.words)}; expected ${expected.join(", ")}`);
  assert(found.words.every((w) => /\bhi\b/.test(w.meaning)), `a meaning without hi: ${JSON.stringify(found.words)}`);
  const want = Math.min(6, withAny(said));
  assert(found.sentences.length === want, `${found.sentences.length} sentences, not ${want}: ${JSON.stringify(found.sentences)}`);
  const owns = said.filter((lemma) => own.has(lemma)).map((lemma) => own.get(lemma).text);
  owns.slice(0, found.sentences.length).forEach((text, i) => assert(starts(found.sentences[i], text), `sentence ${i + 1} is "${found.sentences[i]}", not ${said[i]}'s own "${text}"`));
  return `${found.words.map((w) => `${w.said} = ${w.meaning}`).join("; ")} | ${found.sentences.length} sentences, first ${Math.min(owns.length, found.sentences.length)} their own`;
});

await stage("Dutch → English, one word (hoi, and a form of a word): its meaning, then its own sentence first", async () => {
  const hoi = await typed("hoi");
  await page.screenshot({ path: `${OUT}/02-hoi.png`, fullPage: true });
  assert(hoi.words[0]?.said === "hoi" && hoi.words[0].meaning === glosses.get("hoi"), JSON.stringify(hoi.words));
  assert(starts(hoi.sentences[0] ?? "", own.get("hoi").text), `first sentence "${hoi.sentences[0]}", not "${own.get("hoi").text}"`);
  assert(hoi.sentences.length === Math.min(6, withAny(["hoi"])), `${hoi.sentences.length} sentences, not ${Math.min(6, withAny(["hoi"]))}`);
  // A form that isn't its dictionary form: the gap word of a verb's own sentence (heeft → hebben).
  const [lemma, { form }] = [...own].find(([l, o]) => o.form.toLowerCase() !== l && /^[a-z]+$/.test(o.form) && glosses.has(l));
  const formFound = await typed(form);
  await page.screenshot({ path: `${OUT}/03-form.png`, fullPage: true });
  assert(formFound.words.some((w) => w.lemma === lemma), `${form}: ${JSON.stringify(formFound.words)}, expected ${lemma}`);
  assert(formFound.sentences.some((s) => starts(s, own.get(lemma).text)), `${form}: ${lemma}'s own sentence isn't among ${JSON.stringify(formFound.sentences)}`);
  return `hoi = ${hoi.words[0].meaning}, "${hoi.sentences[0]}"; ${form} → ${lemma}`;
});

// Every word pack, not just the first: a word from the middle of each one's own sentences (a plain Dutch word no gloss
// matches as English, so it's looked up one way only), typed, gives its meaning and its own sentence first.
for (const pack of PACKS.filter((other) => !other.lessons)) {
  const mine = [...own].filter(([l, o]) => o.pack === pack.id && /^[a-z]{4,}$/.test(l) && glosses.has(l) && !glossesWith(l).length);
  await stage(`a word from ${pack.id}, typed: its meaning, then its own sentence first`, async () => {
    assert(mine.length, `${pack.id} has no plain word of its own to type`);
    const [lemma, { text }] = mine[Math.floor(mine.length / 2)];
    const found = await typed(lemma);
    await page.screenshot({ path: `${OUT}/04-${pack.id}.png`, fullPage: true });
    assert(found && !found.empty, `${lemma}: nothing found: ${JSON.stringify(found)}`);
    // Shown as the language writes it (IJslands for ijslands), never as its key where they differ.
    assert(found.words[0]?.said === shown(lemma) && found.words[0].meaning === glosses.get(lemma), `${lemma}: ${JSON.stringify(found.words)}${shown(lemma) !== lemma ? `, expected it shown as ${shown(lemma)}` : ""}`);
    assert(starts(found.sentences[0] ?? "", text), `${lemma}: first sentence "${found.sentences[0]}", not its own "${text}"`);
    return `${lemma} = ${found.words[0].meaning}, "${found.sentences[0]}" (${found.sentences.length} sentences)`;
  });
}

// English object pronouns: each finds its Dutch word (the pronoun rule gives hem the lemma hij, ons wij, so those
// glosses carry him and us; a gloss without them leaves Translate with nothing to show).
await stage("English object pronouns (me, him, her, us, them): each finds its Dutch word", async () => {
  const found = [];
  for (const english of ["me", "him", "her", "us", "them"]) {
    const expected = glossesWith(english);
    assert(expected.length, `no pack word is glossed "${english}"`);
    const got = await typed(english);
    const said = (got?.words ?? []).map((w) => w.lemma);
    assert(expected.some((lemma) => said.includes(lemma)), `${english}: ${JSON.stringify(got?.words)}; expected one of ${expected.join(", ")}`);
    found.push(`${english} → ${said.filter((l) => expected.includes(l)).join("/")}`);
  }
  return found.join("; ");
});

await stage("several words typed: up to 4 main words, 2 sentences each at first", async () => {
  const words = [...own.keys()].filter((l) => /^[a-z]+$/.test(l)).slice(20, 23).join(" ");
  const found = await typed(words);
  assert(found.sentences.length <= 8, `${found.sentences.length} sentences for "${words}"`);
  return `"${words}": ${found.words.length} words, ${found.sentences.length} sentences`;
});

await stage("offline: the device's copy of the packs alone still answers hi with its sentences", async () => {
  await context.setOffline(true);
  const found = await typed("hello");
  await page.waitForTimeout(200);
  const hi = await typed("hi");
  await page.screenshot({ path: `${OUT}/04-hi-offline.png`, fullPage: true });
  await context.setOffline(false);
  assert(hi.words.length && hi.sentences.length === Math.min(6, withAny(hi.words.map((w) => w.said))), JSON.stringify(hi));
  assert(hi.packs, `offline, what's on the device stays under the answer: ${JSON.stringify(hi).slice(0, 200)}`);
  return `${hi.words.length} words, ${hi.sentences.length} sentences offline (hello: ${found.words.length} words)`;
});

if (OPT_IN) {
  const strongWord = OPT_IN.items.map((item) => item.words[item.gap.index]?.[1]).find((l) => l && /^[a-z]+$/.test(l));
  const strongOwn = OPT_IN.items.find((item) => item.words[item.gap.index]?.[1] === strongWord);
  await stage(`an opt-in pack (${OPT_IN.id}): not on the device; Translate online still finds its words; offline, not`, async () => {
    const ids = await page.evaluate(async () => {
      const packs = await import("/js/study/packs.js");
      await packs.syncLibraryPacks();
      return packs.libraryPacks().map((p) => p.id);
    });
    assert(!ids.includes(OPT_IN.id), `the device has it without adding it: ${ids.join(", ")}`);
    const online = await typed(strongWord);
    await page.screenshot({ path: `${OUT}/05-optin-online.png`, fullPage: true });
    assert(online.words.some((w) => w.said === strongWord && w.meaning === OPT_IN.words[strongWord]), `${strongWord} online: ${JSON.stringify(online.words)}`);
    assert(online.button === "Find a pack", `a pack this device hasn't got: ${online.button}`);
    assert(online.note.includes(`${OPT_IN.name} (Lexicommons)`), `credited to Lexicommons: ${online.note}`);
    await context.setOffline(true);
    const offline = await typed(strongWord);
    await context.setOffline(false);
    assert(!offline.words.some((w) => w.said === strongWord), `found offline without the pack: ${JSON.stringify(offline.words)}`);
    return `${strongWord} = ${online.words[0]?.meaning} online, nothing offline`;
  });
  await stage(`added in Explore (Add pack): on the device, offline too, credited to Lexicommons; taken out again`, async () => {
    await page.evaluate((id) => (location.hash = `#explore/item/${id}`), OPT_IN.id);
    const add = page.getByRole("button", { name: "Add pack" });
    await add.waitFor({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/06-optin-explore.png`, fullPage: true });
    await add.click();
    await page.getByRole("button", { name: "Added" }).waitFor({ timeout: 15_000 });
    const record = await page.evaluate(async (id) => (await import("/js/study/packs.js")).allPacks().find((p) => p.id === id)?.origin ?? null, OPT_IN.id);
    assert(record?.kind === "follow" && record.own === true, `on the device as Lexicommons' own: ${JSON.stringify(record)}`);
    await backToToday();
    await context.setOffline(true);
    const offline = await typed(strongWord);
    await page.screenshot({ path: `${OUT}/07-optin-offline.png`, fullPage: true });
    await context.setOffline(false);
    assert(offline.words.some((w) => w.said === strongWord), `offline once added: ${JSON.stringify(offline.words)}`);
    assert(offline.note.includes(`${OPT_IN.name} (Lexicommons)`) && !/Shared in Explore/.test(offline.note), `credited to Lexicommons offline: ${offline.note}`);
    await page.evaluate((id) => (location.hash = `#explore/item/${id}`), OPT_IN.id);
    await page.getByRole("button", { name: "Added" }).click();
    await page.getByRole("button", { name: "Add pack" }).waitFor({ timeout: 15_000 });
    const after = await page.evaluate(async (id) => (await import("/js/study/packs.js")).allPacks().some((p) => p.id === id), OPT_IN.id);
    assert(!after, "still on the device after taking it out");
    return `${strongWord} offline once added; taken out again`;
  });
}

await stage("no page errors", async () => {
  assert(!errors.length, errors.join(" | "));
});

// The test account and the admin go.
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
try {
  sql([`DELETE FROM user_roles WHERE user_id = ${q(curator.id)}`, `DELETE FROM api_tokens WHERE user_id = ${q(curator.id)}`, `DELETE FROM users WHERE id = ${q(curator.id)}`].join("; "));
} catch {}
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
