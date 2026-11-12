// An account keeps its own copy of your progress (src/account-sync.ts; public/js/sync.js ACCOUNT_STORE), on phones in headless Chrome on a
// LOCAL server (it signs up accounts): what a learner means by "signed in".
//   - Nothing is sent before sign-in: the sign-in page and a signed-out visit to /app/ ask the account's store nothing.
//   - A learner does lesson 1 on one device. A second device with nothing on it, signed in to the same account (its session's cookie
//     carried over, as a passkey would give it), is not asked what to learn, and has the lesson: every answer, today's streak day, the
//     words, the place on the path (lesson 1 done, lesson 2 next).
//   - Another account on a third device sees none of it: it's asked what to learn, and its store lists nothing.
//   - The two devices of the account merge as sync merges: a lesson done on the second reaches the first.
//   - Deleting the account empties its store at once (the server answers 401 after; test-account-sync.mjs holds the rows and bytes), and a
//     device left signed out keeps its own copy.
//   - A control: with the account's store answering 503 the second device has nothing and is asked what to learn (so the stage above
//     can fail).
//   - Your own packs are kept there too, a file per pack (12 Nov 2026), on an account and phones of their own: two packs your AI makes
//     reach the first phone over the relay and go to the account's copy; a phone signed in afterwards has both, from that copy alone (its
//     control: the same phone kept from the packs' files has neither, so the relay no longer holds them); a pack deleted on the first phone
//     stays deleted on the second, through a reload; and the one-file form from before (a device on old code still writes it), planted
//     beside the new files with the deleted pack alive and a pack no new file has, is read on a phone signed in after: the deleted pack
//     not brought back, the other not lost, and the old file never written. A pack's recordings never go through the account: the phone that
//     has them says nothing, the phone that took the pack from the account says where they are, with Connect (its own storage brings them).
//     How you like to study goes there too (12 Nov 2026): Practice's length chosen by a press on the first phone reaches the second (its
//     control: a phone kept from the settings' files stays at the default), the first phone's recognizer stays on it, and Reset on the
//     second, by its two presses, puts the first back to the defaults.
//   - Your texts are kept there too (12 Nov 2026), on an account and phones of their own: a text pasted on the first phone, one your AI
//     adds there, and a book from the open shelf opened there (your place in it set) go to the account's copy; a phone signed in afterwards
//     has the two texts whole and the shelf book in its library with your place, Read's top card continuing it, its text fetched again (its control: the
//     same phone kept from the texts' files has none of them); a text removed on the first phone stays removed on the second, through a
//     reload.
// Usage (from the channel repo root, sandbox off):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "account progress check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/account-progress-check.mjs http://localhost:<port> <outDir>     (exit 0 = pass)
process.env.LX_FIRST_RUN = "1";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const { chromium } = await import("./quiet-browser.mjs");
const { answerStep, nextStep, SESSION } = await import("./fixtures/play-session.mjs");

const [BASE, outArg] = process.argv.slice(2);
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("usage: account-progress-check.mjs http://localhost:<port> <outDir> (LOCAL only: it signs up accounts)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 20 * 60_000).unref();

let failed = 0;
let passed = 0;
const results = [];
async function stage(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
    results.push({ name, ok: true, note });
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).slice(0, 500)}`);
    results.push({ name, ok: false, error: error.message });
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

const browser = await chromium.launch({ headless: true });
const errors = [];
const STORE = /\/api\/account\/sync/;
/** A phone with nothing on it: { context, page, asked: every request it made to the account's store }. */
async function device({ before = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block", colorScheme: "dark", locale: "en-US" });
  if (before) await before(context);
  const page = await context.newPage();
  const asked = [];
  page.on("request", (request) => STORE.test(request.url()) && asked.push(`${request.method()} ${new URL(request.url()).pathname}`));
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, asked };
}
async function signUp(page, context, name) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
}
// Signed in on another device as the same account: its session's cookies, as a passkey there would give it.
const signInAs = async (from, to) => to.context.addCookies(await from.context.cookies());
const pickDutch = async (page) => {
  await page.waitForSelector(".lx-welcome", { timeout: 30_000 });
  await page.evaluate(() => document.querySelector('.lx-welcome [data-language="nl"]').click());
  // A language with a full course asks next whether you know some of it already (v738, Find your level): new to it, lesson 1.
  const asked = await page.waitForSelector('.lx-welcome [data-start="new"]', { timeout: 5_000 }).catch(() => null);
  if (asked) await asked.click();
  await page.waitForSelector(".lx-welcome", { state: "detached", timeout: 15_000 });
  await page.waitForSelector("html[data-app-ready]");
};
async function playLesson(page) {
  for (let i = 0; i < 80 && !(await page.evaluate(async () => (await import("/js/study/plan.js")).planSession("lesson").steps.length)); i++) await page.waitForTimeout(500);
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(SESSION, { timeout: 30_000 });
  for (let i = 0; i < 60; i++) {
    const step = await nextStep(page);
    if (step?.kind === "summary") break;
    await answerStep(page, {});
  }
  await page.waitForSelector(`${SESSION} [data-part="session-summary"]`, { timeout: 20_000 });
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(600);
}
const syncNow = (page) => page.evaluate(async () => { const s = await (await import("/js/sync.js")).syncNow(); return { error: s.error, targets: s.targets.map((t) => `${t.id}${t.error ? `: ${t.error}` : ""}`) }; });
// What a device has of the learner's: its answers, today's day in the done log, the words started, and the next lesson.
const has = (page) =>
  page.evaluate(async () => {
    const { allEvidence } = await import("/js/study/progress.js");
    const { streakExport } = await import("/js/study/done.js");
    const { studyOverview } = await import("/js/study/plan.js");
    const rows = allEvidence();
    const overview = studyOverview();
    return {
      answers: rows.length,
      uids: rows.map((row) => row.uid).sort().join(",").length,
      words: [...new Set(rows.filter((row) => row.concept?.startsWith("w:")).map((row) => row.concept))].sort(),
      done: Object.keys(streakExport().things ?? {}).length,
      next: overview.lesson?.name ?? null,
      learning: (await import("/js/study/learning.js")).learning(),
      welcome: Boolean(document.querySelector(".lx-welcome")),
    };
  });

const first = await device();
let one = null;

await stage("nothing is asked of the account's store before sign-in", async () => {
  await first.page.goto(`${BASE}/app/`);
  await first.page.waitForURL(/\/login\?next=/);
  await first.page.waitForTimeout(1500);
  assert(!first.asked.length, `asked while signed out: ${first.asked.join(", ")}`);
  const refused = await first.page.evaluate(async () => (await fetch("/api/account/sync")).status);
  assert(refused === 401, `the store answered a signed-out list with ${refused}`);
  first.asked.length = 0;
});

await stage("a learner signs up and does lesson 1: it's on the device, and it goes to the account's own copy", async () => {
  await signUp(first.page, first.context, "Account progress");
  await pickDutch(first.page);
  await playLesson(first.page);
  const synced = await syncNow(first.page);
  assert(!synced.error && synced.targets.includes("account"), `the sync: ${JSON.stringify(synced)}`);
  one = await has(first.page);
  assert(one.answers > 10 && one.done >= 1 && one.words.length >= 3 && one.next, `lesson 1 on the first device: ${JSON.stringify({ ...one, words: one.words.length })}`);
  const files = await first.page.evaluate(async () => (await (await fetch("/api/account/sync")).json()).files);
  const kinds = [...new Set(files.map((file) => file.name.split(".")[0].replace("lexicommons-", "")))].sort();
  assert(kinds.includes("progress") && kinds.includes("streak"), `the account's files: ${files.map((file) => file.name).join(", ")}`);
  assert(first.asked.some((line) => line.startsWith("PUT ")), "nothing was written to the account's store");
  await first.page.screenshot({ path: join(OUT, "1-first-device-home.png") });
  return `${one.answers} answers, ${one.words.length} words, next: ${one.next}; the account keeps ${files.length} files (${kinds.join(", ")}), ${files.reduce((sum, file) => sum + file.size, 0).toLocaleString("en")} bytes`;
});

await stage("CONTROL: a second device signed in while the account's store can't be reached has nothing and is asked what to learn", async () => {
  const blocked = await device({ before: (context) => context.route(STORE, (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"down"}' })) });
  await signInAs(first, blocked);
  await blocked.page.goto(`${BASE}/app/`);
  await blocked.page.waitForSelector(".lx-welcome", { timeout: 30_000 });
  const got = await has(blocked.page);
  await blocked.context.close();
  assert(got.answers === 0 && got.welcome, `with the store down: ${JSON.stringify({ ...got, words: got.words.length })}`);
});

const second = await device();
await stage("a second device with nothing on it, signed in to the same account: not asked what to learn, and the lesson is there (answers, today's day, the words, the place)", async () => {
  await signInAs(first, second);
  await second.page.goto(`${BASE}/app/`);
  await second.page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
  await second.page.waitForTimeout(1500);
  const got = await has(second.page);
  await second.page.screenshot({ path: join(OUT, "2-second-device-home.png") });
  assert(!got.welcome, "the second device was asked what to learn");
  assert(got.answers === one.answers, `its answers: ${got.answers}, the first device's: ${one.answers}`);
  assert(got.done === one.done, `its done log: ${got.done} things, the first's: ${one.done}`);
  assert(got.words.join() === one.words.join(), `its words: ${got.words.join(", ")}`);
  assert(got.next === one.next, `its next lesson: ${got.next}, the first's: ${one.next}`);
  assert(got.learning === "nl", `it's learning ${got.learning}`);
  const home = await second.page.locator('[data-part="page"]:not([data-ghost])').innerText();
  assert(!/Your first lesson/.test(home), `Home still offers a first lesson: ${home.replace(/\s+/g, " ").slice(0, 160)}`);
  return `${got.answers} answers, ${got.words.length} words, next: ${got.next}`;
});

const other = await device();
let theirs = null;
await stage("another account on a third device sees none of it: it's asked what to learn and its store lists nothing; then it does a lesson of its own", async () => {
  await signUp(other.page, other.context, "Someone else");
  await other.page.waitForSelector(".lx-welcome", { timeout: 30_000 });
  const got = await has(other.page);
  const files = await other.page.evaluate(async () => (await (await fetch("/api/account/sync")).json()).files);
  const read = await other.page.evaluate(async (name) => (await fetch(`/api/account/sync/file?name=${encodeURIComponent(name)}`)).status, await first.page.evaluate(async () => (await (await fetch("/api/account/sync")).json()).files[0].name));
  assert(got.answers === 0 && got.welcome && files.length === 0, `another account: ${JSON.stringify({ ...got, words: got.words.length })}, ${files.length} files`);
  assert(read === 404, `another account reading the first's file by its name got ${read}`);
  await pickDutch(other.page);
  await playLesson(other.page);
  const synced = await syncNow(other.page);
  assert(!synced.error, `its sync: ${JSON.stringify(synced)}`);
  theirs = await has(other.page);
  return `its own lesson: ${theirs.answers} answers`;
});

await stage("the account's two devices merge as sync merges: a lesson done on the second reaches the first", async () => {
  await playLesson(second.page);
  const sent = await syncNow(second.page);
  assert(!sent.error, `the second device's sync: ${JSON.stringify(sent)}`);
  const two = await has(second.page);
  assert(two.answers > one.answers, `the second lesson recorded nothing: ${two.answers}`);
  const took = await syncNow(first.page);
  assert(!took.error, `the first device's sync: ${JSON.stringify(took)}`);
  const back = await has(first.page);
  assert(back.answers === two.answers && back.words.join() === two.words.join() && back.done === two.done, `the first device after: ${back.answers} answers (the second has ${two.answers}), ${back.done} done (${two.done})`);
  return `${two.answers} answers on both, ${two.words.length} words`;
});

// ---------- a device's progress belongs to one account (sync.js deviceOwner; shell/other-owner.js) ----------
const storeOf = (dev) => dev.page.evaluate(async () => (await (await fetch("/api/account/sync")).json()).files.map((file) => `${file.name}@${file.version}`).sort().join("|"));
// Signed in as another device's account, on this device as it stands.
async function becomes(dev, from) {
  await dev.context.clearCookies();
  await dev.context.addCookies(await from.context.cookies());
  dev.asked.length = 0;
  await dev.page.goto(`${BASE}/app/#today`);
  await dev.page.reload();
  await dev.page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
}
const SHEET = '[data-other-owner]';

await stage("a different account signs in on a device that holds the first's progress: told once, and nothing merges or uploads either way", async () => {
  const [mineBefore, theirsBefore, here] = [await storeOf(first), await storeOf(other), await has(second.page)];
  await becomes(second, other);
  await second.page.waitForSelector(SHEET, { timeout: 15_000 });
  const said = await second.page.locator(SHEET).innerText();
  assert(/someone else's progress/.test(said) && /Use my progress on this device/.test(said) && /Not now/.test(said), `the sheet: ${said.replace(/\s+/g, " ").slice(0, 200)}`);
  await second.page.waitForTimeout(1200);
  await second.page.screenshot({ path: join(OUT, "3-another-accounts-progress.png") });
  await second.page.getByRole("button", { name: "Not now" }).click();
  // A sync asked for by hand, and the wait a change's own sync takes: still nothing.
  const status = await second.page.evaluate(async () => { const s = await (await import("/js/sync.js")).syncNow(); return { held: s.held, error: s.error }; });
  await second.page.waitForTimeout(7_000);
  assert(status.held === true, `the sync's state: ${JSON.stringify(status)}`);
  assert(!second.asked.some((line) => /^PUT /.test(line)), `written to the store from this device: ${second.asked.join(", ")}`);
  assert((await storeOf(first)) === mineBefore, "the first account's copy changed");
  assert((await storeOf(other)) === theirsBefore, "the second account's copy changed");
  const still = await has(second.page);
  assert(still.answers === here.answers, `the device's own progress changed: ${still.answers} of ${here.answers}`);
  // Said once a visit: another page of the same visit doesn't open it again.
  await second.page.evaluate(() => (location.hash = "#study"));
  await second.page.waitForTimeout(800);
  assert(!(await second.page.locator(`${SHEET}:visible`).count()), "the sheet came back in the same visit");
  return `the device keeps the first account's ${still.answers} answers; neither account's copy moved`;
});

await stage("PLANT: with the device taken for the signed-in account's own (no owner kept), the same sign-in merges the first's progress into a third account's copy: the stage above can fail", async () => {
  const third = await device();
  await signUp(third.page, third.context, "Planted merge");
  await third.page.waitForSelector(".lx-welcome", { timeout: 30_000 });
  const carrier = await device();
  await signInAs(first, carrier);
  await carrier.page.goto(`${BASE}/app/`);
  await carrier.page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
  await carrier.page.waitForTimeout(1500);
  assert((await has(carrier.page)).answers > 0, "the carrier device has none of the first account's progress");
  await carrier.page.evaluate(() => localStorage.removeItem("lx.device.owner.v1"));
  await becomes(carrier, third);
  await syncNow(carrier.page);
  const merged = await third.page.evaluate(async () => (await (await fetch("/api/account/sync")).json()).files.length);
  await third.page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) }).catch(() => {}));
  await carrier.context.close();
  await third.context.close();
  assert(merged > 0, "with no owner kept, nothing reached the third account's copy: the plant proves nothing");
  return `${merged} files of the first account's progress reached a third account's copy once the owner was taken away`;
});

await stage("Use my progress on this device: the device's is cleared and the signed-in account's own comes in its place; the first account's copy is untouched", async () => {
  const mineBefore = await storeOf(first);
  await becomes(second, other);
  await second.page.evaluate(async () => (await import("/js/shell/other-owner.js")).offerOwnProgress({ again: true }));
  await second.page.waitForSelector(SHEET, { timeout: 15_000 });
  // A text the first person added here, which no storage of theirs has: planted, so the warning names it, and Clear it and use mine goes on.
  await second.page.evaluate(async () => {
    const book = await (await import("/js/read/import-text.js")).bookFromText("A text of theirs.\n\nIt has two short paragraphs, and it lives on this device alone.", { title: "Theirs" });
    await (await import("/js/read/store.js")).addBook(book);
  });
  await second.page.getByRole("button", { name: "Use my progress on this device" }).click();
  await second.page.waitForSelector("[data-other-owner-warning]", { timeout: 5_000 });
  const named = await second.page.locator("[data-other-owner-warning]").innerText();
  assert(/^On this device and nowhere else: a text\. Clearing this device loses it for good\.$/.test(named.trim()), `the warning for a text alone: ${named}`);
  await second.page.getByRole("button", { name: "Clear it and use mine" }).click();
  await second.page.waitForFunction(() => !document.querySelector("[data-other-owner]") && document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 60_000 });
  await second.page.waitForTimeout(2500);
  const got = await has(second.page);
  await second.page.screenshot({ path: join(OUT, "4-own-progress-here.png") });
  assert(!got.welcome && got.answers === theirs.answers && got.words.join() === theirs.words.join(), `the device after: ${got.answers} answers (their account has ${theirs.answers}), welcome ${got.welcome}`);
  assert((await storeOf(first)) === mineBefore, "the first account's copy changed");
  assert(!(await second.page.locator(SHEET).count()), "the sheet is still up on a device that's theirs now");
  return `the device now has the second account's ${got.answers} answers; the first account's copy as it was`;
});

await stage("when some of the device's progress was never saved to its own account: said first, asked again, and Keep it keeps it", async () => {
  // A device of the first account's, synced; then an answer recorded with its store out of reach (so never saved); then the second account signs in.
  const lone = await device();
  await signInAs(first, lone);
  await lone.page.goto(`${BASE}/app/`);
  await lone.page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
  await lone.page.waitForTimeout(1500);
  await lone.context.route(/\/api\/account\/sync/, (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"down"}' }));
  await lone.page.evaluate(async () => (await import("/js/study/progress.js")).record([{ concept: "w:koffie", outcome: "right", test: "pick", skill: "read", activity: "word" }]));
  const before = await has(lone.page);
  await lone.context.unroute(/\/api\/account\/sync/);
  await becomes(lone, other);
  await lone.page.waitForSelector(SHEET, { timeout: 15_000 });
  await lone.page.getByRole("button", { name: "Use my progress on this device" }).click();
  await lone.page.waitForSelector("[data-other-owner-warning]", { timeout: 5_000 });
  const warned = await lone.page.locator(SHEET).innerText();
  assert(/On this device and nowhere else: some of what was studied here\./.test(warned) && /Keep it/.test(warned) && /Clear it and use mine/.test(warned), `the warning: ${warned.replace(/\s+/g, " ").slice(0, 200)}`);
  // And the owner's own texts and packs that no storage of theirs has: named, in a word.
  const { onlyHereWords } = await lone.page.evaluate(async () => {
    const m = await import("/js/shell/other-owner.js");
    return { onlyHereWords: [m.onlyHereWords({ studied: false, texts: 2, packs: 1 }), m.onlyHereWords({ studied: true, texts: 1, packs: 0 }), m.onlyHereWords({ studied: false, texts: 0, packs: 0 })] };
  });
  assert(onlyHereWords.join("|") === "2 texts and a pack|some of what was studied here and a text|", `the words: ${onlyHereWords.join("|")}`);
  await lone.page.screenshot({ path: join(OUT, "5-only-on-this-device.png") });
  await lone.page.getByRole("button", { name: "Keep it" }).click();
  const after = await has(lone.page);
  await lone.context.close();
  assert(after.answers === before.answers, `Keep it lost something: ${after.answers} of ${before.answers}`);
  return `${before.answers} answers, one of them only on the device: warned, kept`;
});

// ---------- your own packs, kept with the account (an account and phones of their own) ----------

// A phone's start: into the app, Dutch picked if it's asked what to learn.
async function startApp(page) {
  await page.goto(`${BASE}/app/`);
  await page.waitForFunction(() => document.querySelector(".lx-welcome") || document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 60_000 });
  if (await page.evaluate(() => Boolean(document.querySelector(".lx-welcome")))) await pickDutch(page);
  await page.waitForSelector("html[data-app-ready]");
}
const packsOn = (page) => page.evaluate(async () => (await import("/js/study/packs.js")).yourPacks().map((r) => r.id).sort());
// Synced until fn(packs) holds (a sync every 3 s), or the time's up: the packs then.
async function syncedUntil(page, fn, seconds = 60) {
  let packs = [];
  for (let i = 0; i < seconds / 3; i++) {
    await syncNow(page);
    packs = await packsOn(page);
    if (fn(packs)) return packs;
    await page.waitForTimeout(3000);
  }
  return packs;
}
const PACK_FILE = /^lexicommons-packs\.(?:([a-z0-9][a-z0-9-]{1,47})\.)?([0-9a-f]{8})\.([0-9a-f]{8})\.json$/;
const ITEM = { sentence: "Ik drink koffie.", lemmas: { Ik: "ik", drink: "drinken", koffie: "koffie" }, literal: ["I", "drink", "coffee"], natural: "I drink coffee.", wrong: ["Ik koffie drink."], gap: { word: "drink", options: ["drink", "drinkt", "drinken"] }, patterns: ["present"] };
const WORDS = { ik: "I", drinken: "to drink", koffie: "coffee" };
const pk = { a: null, token: null, tag: null, files: {}, cookies: null };
async function mcpTool(name, args) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pk.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error || result.isError) throw new Error(`${name}: ${error?.message ?? result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}
// The account's store as that account's session, from here (a non-browser's request, as the app's own origin rules allow).
const cookieHeader = () => pk.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const storeList = async () => (await (await fetch(`${BASE}/api/account/sync`, { headers: { cookie: cookieHeader() } })).json()).files;
const storeRead = async (name) => (await fetch(`${BASE}/api/account/sync/file?name=${encodeURIComponent(name)}`, { headers: { cookie: cookieHeader() } })).text();
async function storeWrite(name, text, seen) {
  const response = await fetch(`${BASE}/api/account/sync/file?name=${encodeURIComponent(name)}${seen ? `&seen=${encodeURIComponent(seen)}` : ""}`, { method: "PUT", headers: { cookie: cookieHeader(), "Content-Type": "application/json" }, body: text });
  if (!response.ok) throw new Error(`writing ${name}: ${response.status} ${await response.text()}`);
}

await stage("your AI makes two packs: they reach the first phone over the relay and go to the account's copy, a file per pack", async () => {
  pk.a = await device();
  await signUp(pk.a.page, pk.a.context, "Packs through the account");
  await pickDutch(pk.a.page);
  pk.token = await pk.a.page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Account packs check" }) })).json()).token);
  assert(pk.token?.startsWith("lct_"), "a token for the AI");
  await pk.a.page.evaluate(async () => {
    const { whoAmI } = await import("/js/shell/api.js");
    const { setAiConnected } = await import("/js/shell/layout.js");
    setAiConnected((await whoAmI()).aiConnected);
  });
  await mcpTool("create_pack", { pack_id: "account-trip", name: "Account trip", language: "nl", items: [ITEM], words: WORDS });
  await mcpTool("create_pack", { pack_id: "account-cafe", name: "Account café", language: "nl", items: [ITEM], words: WORDS });
  const packs = await syncedUntil(pk.a.page, (p) => p.includes("account-trip") && p.includes("account-cafe"));
  assert(packs.includes("account-trip") && packs.includes("account-cafe"), `the first phone's packs: ${packs}`);
  await syncNow(pk.a.page);
  pk.cookies = await pk.a.context.cookies();
  const names = (await storeList()).map((f) => f.name).filter((n) => n.startsWith("lexicommons-packs."));
  const parts = names.map((n) => PACK_FILE.exec(n));
  assert(parts.every(Boolean) && parts.every((m) => m[1]), `every packs file is one pack's: ${names}`);
  for (const id of ["account-trip", "account-cafe"]) assert(parts.some((m) => m[1] === id), `${id} has a file: ${names}`);
  pk.tag = parts[0][2];
  // Each pack's record as the first phone wrote it, for the old file below.
  for (const m of parts) pk.files[m[1]] = JSON.parse(await storeRead(m[0]));
  return `the account keeps ${names.length} packs files: ${names.join(", ")}`;
});

await stage("CONTROL: a phone signed in now but kept from the packs' files on the account has neither pack: the relay no longer holds them", async () => {
  const control = await device({
    before: (context) => context.route((url) => url.pathname === "/api/account/sync/file" && (url.searchParams.get("name") ?? "").startsWith("lexicommons-packs."), (route) => route.fulfill({ status: 503, body: "{}" })),
  });
  await control.context.addCookies(pk.cookies);
  await startApp(control.page);
  const packs = await syncedUntil(control.page, (p) => p.includes("account-trip") || p.includes("account-cafe"), 24);
  await control.context.close();
  assert(!packs.includes("account-trip") && !packs.includes("account-cafe"), `the kept-out phone has them anyway: ${packs}`);
  return `after 24 s of syncs it has ${packs.length ? packs.join(", ") : "no pack of the learner's"}`;
});

await stage("a phone signed in afterwards has both packs, from the account's copy", async () => {
  pk.b = await device();
  await pk.b.context.addCookies(pk.cookies);
  await startApp(pk.b.page);
  const from = Date.now();
  const packs = await syncedUntil(pk.b.page, (p) => p.includes("account-trip") && p.includes("account-cafe"));
  assert(packs.includes("account-trip") && packs.includes("account-cafe"), `the second phone's packs: ${packs}`);
  const names = await pk.b.page.evaluate(async () => (await import("/js/study/packs.js")).yourPacks().map((r) => r.pack.name).sort());
  return `both there within ${Math.round((Date.now() - from) / 1000)} s: ${names.join(", ")}`;
});

await stage("a pack deleted on the first phone stays deleted on the second, through a reload and more syncs", async () => {
  const done = await pk.a.page.evaluate(async () => (await import("/js/study/pack-inbox.js")).deletePackEverywhere("account-trip"));
  assert(!(await packsOn(pk.a.page)).includes("account-trip"), `deleted on the first phone (${JSON.stringify(done)})`);
  await syncNow(pk.a.page);
  let packs = await syncedUntil(pk.b.page, (p) => !p.includes("account-trip"));
  assert(!packs.includes("account-trip") && packs.includes("account-cafe"), `the second phone after: ${packs}`);
  await pk.b.page.reload();
  await pk.b.page.waitForSelector("html[data-app-ready]");
  for (let i = 0; i < 2; i++) {
    await syncNow(pk.b.page);
    await syncNow(pk.a.page);
  }
  packs = await packsOn(pk.b.page);
  assert(!packs.includes("account-trip") && packs.includes("account-cafe"), `the second phone after a reload: ${packs}`);
  assert(!(await packsOn(pk.a.page)).includes("account-trip"), "and the first");
  const tombs = [];
  for (const f of (await storeList()).filter((f) => PACK_FILE.exec(f.name)?.[1] === "account-trip")) tombs.push(JSON.parse(await storeRead(f.name)).records["account-trip"]?.gone === true);
  assert(tombs.length >= 2 && tombs.every(Boolean), `each phone's file of it says deleted: ${tombs}`);
  return `deleted ${done.everywhere ? "everywhere through the relay" : "here"}, gone on both through a reload; ${tombs.length} files of it say so`;
});

await stage("a pack's recordings never go through the account: the phone that has them says nothing, and the phone that took the pack from the account says where they are and how to bring them", async () => {
  // A recording of the café pack's on the first phone, kept as your AI's recordings are (a real clip, named by its bytes), its manifest saved
  // with the pack.
  const clip = await pk.a.page.evaluate(async () => {
    const bytes = new Uint8Array(await (await fetch("/audio/fx/match-1.mp3")).arrayBuffer());
    const { sha256Hex } = await import("/js/storage.js");
    const clip = `${(await sha256Hex(bytes)).slice(0, 16)}.mp3`;
    const { keepClip } = await import("/js/study/clips.js");
    const { mergeAudio } = await import("/js/study/pack-audio.js");
    const packs = await import("/js/study/packs.js");
    const record = packs.yourPack("account-cafe");
    const item = record.pack.items.find((i) => (i.words ?? []).length);
    const manifest = mergeAudio(null, { voices: { anna: { name: "Anna", locale: "nl-NL", items: { [item.id]: { clip, seconds: 1.5, words: item.words.map((_, n) => [n * 0.2, n * 0.2 + 0.1]) } } } } }, record.pack);
    const saved = await packs.savePack(record.pack, { by: record.by, audio: manifest, account: record.account });
    if (!saved.ok) throw new Error(`the recordings: ${JSON.stringify(saved.errors).slice(0, 300)}`);
    if (!(await keepClip(clip, new Blob([bytes], { type: "audio/mpeg" })))) throw new Error("the clip wasn't kept");
    return clip;
  });
  const elsewhere = (page) => page.evaluate(() => /Its recordings are on your other device/.test(document.querySelector('[data-part="page"]')?.textContent ?? ""));
  const openPack = async (page) => {
    await page.evaluate(() => (location.hash = "#study/packs"));
    await page.waitForTimeout(400);
    await page.evaluate(() => (location.hash = "#settings/study/packs/account-cafe"));
    await page.waitForFunction(() => /Account café/.test(document.querySelector('[data-part="page"]')?.textContent ?? ""), null, { timeout: 30_000 });
    await page.waitForTimeout(800);
  };
  await openPack(pk.a.page);
  assert(!(await elsewhere(pk.a.page)), "the phone with the recording says they're elsewhere");
  await pk.a.page.screenshot({ path: join(OUT, "recordings-here-phone1.png") });
  await syncNow(pk.a.page);
  // The second phone takes the pack with its manifest from the account, and no recording comes with it.
  for (let i = 0; i < 20; i++) {
    await syncNow(pk.b.page);
    if (await pk.b.page.evaluate(async () => Boolean((await import("/js/study/packs.js")).yourPack("account-cafe")?.audio))) break;
    await pk.b.page.waitForTimeout(2000);
  }
  const onB = await pk.b.page.evaluate(async (clip) => ({ audio: Boolean((await import("/js/study/packs.js")).yourPack("account-cafe")?.audio), clip: (await import("/js/study/clips.js")).hasClip(clip) }), clip);
  assert(onB.audio && !onB.clip, `the second phone: ${JSON.stringify(onB)}`);
  await openPack(pk.b.page);
  assert(await elsewhere(pk.b.page), "the second phone doesn't say where its recordings are");
  const row = pk.b.page.locator('[data-part="list-row"]', { hasText: "Its recordings are on your other device" });
  assert((await row.getByRole("button", { name: "Connect" }).count()) === 1, "no way to bring them");
  await row.scrollIntoViewIfNeeded();
  await pk.b.page.screenshot({ path: join(OUT, "recordings-elsewhere-phone2.png") });
  return "the first phone (recording here): nothing said; the second (from the account, none here): said, with Connect";
});

await stage("how you like to study: a choice on the first phone reaches the second through the account (a phone kept from the settings' files gets none: the control), the device's own recognizer stays on its device, and Reset on the second reaches the first", async () => {
  const studied = (page) => page.evaluate(async () => { const s = (await import("/js/study/settings.js")).getStudySettings(); return { minutes: s.practice.minutes, reveal: s.cards.reveal, engine: s.say.engine }; });
  // The first phone: Practice's length chosen in Settings → Study by a press, a card setting and its recognizer (the device's own) set too.
  await pk.a.page.evaluate(() => (location.hash = "#settings/study/practice"));
  await pk.a.page.locator('[data-part="segment"]', { hasText: /^10 min$/ }).click();
  await pk.a.page.evaluate(async () => {
    const { setStudySetting } = await import("/js/study/settings.js");
    setStudySetting("cards.reveal", "english");
    setStudySetting("say.engine", "whisper");
  });
  const a = await studied(pk.a.page);
  assert(a.minutes === 10 && a.reveal === "english" && a.engine === "whisper", `the first phone: ${JSON.stringify(a)}`);
  await syncNow(pk.a.page);
  const control = await device({
    before: (context) => context.route((url) => url.pathname === "/api/account/sync/file" && (url.searchParams.get("name") ?? "").startsWith("lexicommons-study-settings."), (route) => route.fulfill({ status: 503, body: "{}" })),
  });
  await control.context.addCookies(pk.cookies);
  await startApp(control.page);
  for (let i = 0; i < 6; i++) {
    await syncNow(control.page);
    await control.page.waitForTimeout(2000);
  }
  const kept = await studied(control.page);
  await control.context.close();
  assert(kept.minutes === 5 && kept.reveal === "slide", `CONTROL: the phone kept from the settings' files has them anyway: ${JSON.stringify(kept)}`);
  let b = null;
  for (let i = 0; i < 20; i++) {
    await syncNow(pk.b.page);
    b = await studied(pk.b.page);
    if (b.minutes === 10) break;
    await pk.b.page.waitForTimeout(2000);
  }
  assert(b.minutes === 10 && b.reveal === "english", `the second phone: ${JSON.stringify(b)}`);
  assert(b.engine === "browser", `the first phone's recognizer reached the second: ${b.engine}`);
  await pk.b.page.evaluate(() => (location.hash = "#settings/study"));
  const row = pk.b.page.locator('[data-part="list-row"]', { hasText: "Practice" }).first();
  await row.waitFor();
  // The page's slide in finished (the still is of the page, not the way to it).
  await pk.b.page.waitForFunction(() => { const r = document.querySelector('[data-part="list-row"]')?.getBoundingClientRect(); return r && r.left >= 0 && r.left < 40; }, null, { timeout: 10_000 });
  await pk.b.page.waitForTimeout(600);
  assert(/10 min/.test(await row.textContent()), `Settings → Study on the second phone: ${await row.textContent()}`);
  await pk.b.page.screenshot({ path: join(OUT, "study-settings-phone2.png") });
  // What Settings → Sync's What's kept there lists for it (sync.js syncStatus, the sheet's rows: a copy from npm run local has no Sync page):
  // its name and count, the two settings chosen on the first phone.
  const kindRow = await pk.b.page.evaluate(async () => {
    const kind = (await import("/js/sync.js")).syncStatus().kinds.find((k) => k.id === "study-settings");
    return kind ? { label: kind.label, count: kind.count, says: kind.counted?.(kind.count) ?? null } : null;
  });
  assert(kindRow?.label === "How you like to study" && kindRow.count === 2 && kindRow.says === "2 settings you chose", `What's kept there for it: ${JSON.stringify(kindRow)}`);
  await pk.b.page.evaluate(() => (location.hash = "#settings/study"));
  await pk.b.page.locator('[data-part="list-row"]', { hasText: "Reset study settings" }).waitFor();
  await pk.b.page.waitForTimeout(600);
  // Reset on the second phone, by its two presses: back to the defaults on both, the first phone's recognizer as it was.
  const reset = pk.b.page.locator('[data-part="list-row"]', { hasText: "Reset study settings" });
  await reset.click();
  await pk.b.page.locator('[data-part="list-row"]', { hasText: "Press again to reset them" }).click();
  await pk.b.page.waitForTimeout(500);
  b = await studied(pk.b.page);
  assert(b.minutes === 5 && b.reveal === "slide", `reset on the second phone: ${JSON.stringify(b)}`);
  await syncNow(pk.b.page);
  let after = null;
  for (let i = 0; i < 20; i++) {
    await syncNow(pk.a.page);
    after = await studied(pk.a.page);
    if (after.minutes === 5) break;
    await pk.a.page.waitForTimeout(2000);
  }
  assert(after.minutes === 5 && after.reveal === "slide" && after.engine === "whisper", `the first phone after the second's Reset: ${JSON.stringify(after)}`);
  return `10 min and the English-order card reached the second phone (the kept-out phone stayed at 5 min); the recognizer stayed; Reset on the second put the first back to 5 min, its recognizer still Whisper`;
});

await stage("the one-file form from before beside the new files: the deleted pack not brought back, the other not lost, the old file never written", async () => {
  await pk.a.context.close();
  await pk.b.context.close();
  // The old form: every pack in one file with no shard, the deleted one still alive in it, as a device on old code that never saw the delete
  // would have it (the records the first phone wrote before the delete).
  const oldName = `lexicommons-packs.${pk.tag}.0d0d0d0d.json`;
  const records = { "account-trip": pk.files["account-trip"].records["account-trip"], "account-cafe": pk.files["account-cafe"].records["account-cafe"] };
  assert(records["account-trip"]?.value && records["account-cafe"]?.value, "the records from before the delete");
  await storeWrite(oldName, JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "packs", account: pk.tag, records }), null);
  // And the café pack only there: every new file of it emptied (as if only the old device had it).
  for (const f of (await storeList()).filter((f) => PACK_FILE.exec(f.name)?.[1] === "account-cafe")) {
    await storeWrite(f.name, JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "packs", account: pk.tag, records: {} }), f.version);
  }
  const oldVersion = (await storeList()).find((f) => f.name === oldName).version;
  const d = await device();
  const puts = [];
  d.page.on("request", (r) => r.method() === "PUT" && r.url().includes("/api/account/sync/file") && puts.push(new URL(r.url()).searchParams.get("name")));
  await d.context.addCookies(pk.cookies);
  await startApp(d.page);
  let packs = await syncedUntil(d.page, (p) => p.includes("account-cafe"));
  assert(packs.includes("account-cafe"), `the pack only the old file has is lost: ${packs}`);
  assert(!packs.includes("account-trip"), `the deleted pack came back from the old file: ${packs}`);
  await d.page.reload();
  await d.page.waitForSelector("html[data-app-ready]");
  for (let i = 0; i < 2; i++) await syncNow(d.page);
  packs = await packsOn(d.page);
  assert(packs.includes("account-cafe") && !packs.includes("account-trip"), `after a reload: ${packs}`);
  const files = await storeList();
  assert(files.find((f) => f.name === oldName)?.version === oldVersion, "the old file was written");
  const wroteOld = puts.filter((n) => PACK_FILE.exec(n ?? "") && !PACK_FILE.exec(n)[1]);
  assert(!wroteOld.length, `a one-file packs file was written: ${wroteOld}`);
  const own = puts.filter((n) => PACK_FILE.exec(n ?? "")?.[1] === "account-cafe");
  assert(own.length, `the phone wrote the café pack to a file of its own: ${puts}`);
  await d.context.close();
  return `the café pack taken from the old file alone and written to its own file; the deleted one stays deleted; the old file untouched (${oldVersion})`;
});

// ---------- your texts, kept with the account (an account and phones of their own) ----------

const tx = { a: null, cookies: null, token: null, ids: {} };
const textsOn = (page) => page.evaluate(async () => (await (await import("/js/read/store.js")).listBooks()).map((b) => b.id).sort());
async function textsUntil(page, fn, seconds = 60) {
  let ids = [];
  for (let i = 0; i < seconds / 3; i++) {
    await syncNow(page);
    ids = await textsOn(page);
    if (fn(ids)) return ids;
    await page.waitForTimeout(3000);
  }
  return ids;
}

await stage("a text pasted on the first phone, one your AI adds, and a book from the shelf opened there go to the account's copy", async () => {
  tx.a = await device();
  await signUp(tx.a.page, tx.a.context, "Texts through the account");
  await pickDutch(tx.a.page);
  pk.token = await tx.a.page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Account texts check" }) })).json()).token);
  assert(pk.token?.startsWith("lct_"), "a token for the AI");
  // Pasted, as Read's Add a text does it (import-text.js, store.addBook).
  tx.ids.pasted = await tx.a.page.evaluate(async () => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const book = await bookFromText("Mijn dagboek\n\nIk lees elke dag een boek. Het is mooi en het is stil.", { lang: "nl", title: "Mijn dagboek" });
    await (await import("/js/read/store.js")).addBook(book);
    return book.id;
  });
  // Your AI's, over MCP: the upload, its PUT, add_text, then the first phone takes it.
  const ticket = await mcpTool("request_text_upload", { format: "text", filename: "jas.txt" });
  const put = await fetch(ticket.upload_url, { method: "PUT", headers: { "Content-Type": ticket.content_type }, body: "De rode jas\n\nOma heeft een rode jas. De jas hangt aan de deur." });
  assert(put.ok, `the upload: ${put.status}`);
  const added = await mcpTool("add_text", { upload_id: ticket.upload_id, language: "nl", title: "De rode jas", authors: [] });
  tx.ids.ai = added.text_id;
  for (let i = 0; i < 20 && !(await textsOn(tx.a.page)).includes(tx.ids.ai); i++) {
    await tx.a.page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
    await tx.a.page.waitForTimeout(1500);
  }
  assert((await textsOn(tx.a.page)).includes(tx.ids.ai), "your AI's text reached the first phone");
  // A book from the open shelf, opened as the shelf opens one, and your place in it.
  const shelf = await tx.a.page.evaluate(async () => {
    const { loadCatalog, fetchOpenBook } = await import("/js/read/shelf.js");
    const store = await import("/js/read/store.js");
    const catalog = await loadCatalog();
    const meta = (catalog.books ?? []).find((b) => b.lang === "nl") ?? (catalog.books ?? [])[0];
    if (!meta) return null;
    const record = await fetchOpenBook(meta);
    await store.addBook(record.book, record.weaves, { definitions: record.definitions, from: "shelf" });
    await store.setPosition(meta.id, 7, record.book.version);
    return { id: meta.id, title: meta.title };
  });
  assert(shelf, "the local library has no shelf book to open");
  tx.ids.shelf = shelf.id;
  await syncNow(tx.a.page);
  await tx.a.page.waitForTimeout(1500);
  await syncNow(tx.a.page);
  tx.cookies = await tx.a.context.cookies();
  pk.cookies = tx.cookies;
  const names = (await storeList()).map((f) => f.name).filter((n) => n.startsWith("lexicommons-texts."));
  assert(names.length >= 3, `the account's texts files: ${names}`);
  const texts = await Promise.all(names.map(storeRead));
  assert(texts.some((t) => t.includes("Mijn dagboek")) && texts.some((t) => t.includes("De rode jas")), "the two texts are in the account's copy");
  const shelfFile = texts.find((t) => t.includes(`"${shelf.id}"`));
  assert(shelfFile && !shelfFile.includes('"words":['), "the shelf book went as its entry alone");
  return `${names.length} texts files: the pasted text, your AI's, and "${shelf.title}" as its entry`;
});

await stage("CONTROL: a phone signed in now but kept from the texts' files on the account has none of them", async () => {
  const control = await device({
    before: (context) => context.route((url) => url.pathname === "/api/account/sync/file" && (url.searchParams.get("name") ?? "").startsWith("lexicommons-texts."), (route) => route.fulfill({ status: 503, body: "{}" })),
  });
  await control.context.addCookies(tx.cookies);
  await startApp(control.page);
  const ids = await textsUntil(control.page, (got) => got.length > 0, 24);
  await control.context.close();
  const ours = [tx.ids.pasted, tx.ids.ai, tx.ids.shelf].filter((id) => ids.includes(id));
  assert(!ours.length, `the kept-out phone has them anyway: ${ours}`);
  return `after 24 s of syncs it has ${ids.length ? ids.join(", ") : "none of them"}`;
});

await stage("a phone signed in afterwards has both texts whole, and the shelf book in its library with your place: Read continues it, its text fetched again here", async () => {
  tx.b = await device();
  await tx.b.context.addCookies(tx.cookies);
  await startApp(tx.b.page);
  const want = [tx.ids.pasted, tx.ids.ai, tx.ids.shelf];
  const ids = await textsUntil(tx.b.page, (got) => want.every((id) => got.includes(id)));
  assert(want.every((id) => ids.includes(id)), `the second phone's texts: ${ids}`);
  const here = await tx.b.page.evaluate(async (ids) => {
    const store = await import("/js/read/store.js");
    return {
      pasted: (await store.getBook(ids.pasted))?.text.words.length ?? 0,
      ai: (await store.getBook(ids.ai))?.book.source.kind ?? null,
      shelfEntry: (await store.getEntry(ids.shelf))?.from ?? null,
      title: (await store.getEntry(ids.shelf))?.title ?? null,
      place: (await store.getPosition(ids.shelf))?.word ?? null,
    };
  }, tx.ids);
  assert(here.pasted > 5 && here.ai === "ai", `the two texts whole: ${JSON.stringify(here)}`);
  assert(here.shelfEntry === "shelf" && here.place === 7, `the shelf book listed with your place: ${JSON.stringify(here)}`);
  // Being read on the first phone: Read's top card continues it here (its text fetched again in the background), never offers it as a first book.
  await tx.b.page.evaluate(() => (location.hash = "#read"));
  const card = tx.b.page.locator('[data-part="page"] [data-part="continue-card"]', { hasText: "Continue reading" });
  await card.waitFor({ timeout: 30_000 });
  const said = (await card.innerText()).replace(/\s+/g, " ");
  assert(said.includes(here.title ?? "") && !/A good first book/.test(said), `Read's top card: ${said}`);
  await tx.b.page.screenshot({ path: join(OUT, "texts-continue-phone2.png") });
  await tx.b.page.evaluate((id) => (location.hash = `#read/book/${encodeURIComponent(id)}`), tx.ids.shelf);
  await tx.b.page.waitForSelector('[data-part="reader"][data-ready]', { timeout: 60_000 });
  const fetched = await tx.b.page.evaluate(async (id) => Boolean(await (await import("/js/read/store.js")).getBook(id)), tx.ids.shelf);
  assert(fetched, "the shelf book's text wasn't fetched on open");
  await tx.b.page.screenshot({ path: join(OUT, "texts-shelf-opened.png") });
  await tx.b.page.evaluate(() => (location.hash = "#read"));
  return `both texts whole; "${here.title}" listed at word 7, continued on Read, opened with its text fetched again`;
});

await stage("a text removed on the first phone stays removed on the second, through a reload and more syncs", async () => {
  const done = await tx.a.page.evaluate(async (id) => (await import("/js/read/text-inbox.js")).removeText(id), tx.ids.pasted);
  assert(!(await textsOn(tx.a.page)).includes(tx.ids.pasted), `removed on the first phone (${JSON.stringify(done)})`);
  await syncNow(tx.a.page);
  let ids = await textsUntil(tx.b.page, (got) => !got.includes(tx.ids.pasted));
  assert(!ids.includes(tx.ids.pasted), `the second phone after: ${ids}`);
  await tx.b.page.reload();
  await tx.b.page.waitForSelector("html[data-app-ready]");
  for (let i = 0; i < 2; i++) {
    await syncNow(tx.b.page);
    await syncNow(tx.a.page);
  }
  ids = await textsOn(tx.b.page);
  assert(!ids.includes(tx.ids.pasted) && ids.includes(tx.ids.ai), `after a reload: ${ids}`);
  await tx.a.context.close();
  await tx.b.context.close();
  return "removed on both, through a reload";
});

await stage("deleting the account empties its store at once, and a device left signed out keeps its own copy", async () => {
  const before = await has(second.page);
  const files = await first.page.evaluate(async () => (await (await fetch("/api/account/sync")).json()).files.length);
  assert(files > 0, "no files to delete");
  // (The two devices share one session here, so deleting the account on the first signs the second out too.)
  const gone = await first.page.evaluate(async () => {
    const out = await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) });
    return { deleted: out.status, after: (await fetch("/api/account/sync")).status };
  });
  assert(gone.deleted < 400 && gone.after === 401, `deleting: ${JSON.stringify(gone)}`);
  const kept = await has(second.page);
  assert(kept.answers === before.answers && kept.done === before.done, `signed out, the device's own copy: ${kept.answers} of ${before.answers} answers`);
  return `${files} files went with the account (test-account-sync holds the rows and bytes); the signed-out device still has its ${kept.answers} answers`;
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
