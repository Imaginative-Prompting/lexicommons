// A newcomer's first lesson is the path's (study/packs.js lessonsComing, onLessonsComing; the sync's order), never the starter's: on the real
// path-nl and two Dutch word bands, served as the library serves them, the catalog listing path-nl last as the live one does. Each scenario a
// fresh device in a process of its own:
//   new          before any sync the lessons are coming; path-nl fetched first, nothing else while it's held; once it's checked, studying has it
//                (path.js's first lesson is path-nl's lesson 1) before any band, lessonsComing false where onContentChange and onLessonsComing
//                hear it, told once; every view then in the catalog's order; a later sync (a band's new version, path-nl's) tells nothing
//   old-catalog  a catalog from before entries said their lessons: path-nl, by its name, first all the same
//   none         a catalog with no lessons pack for the language: not coming once it's read, told once
//   unreachable  the catalog can't be read: not coming, told once
//   refused      path-nl's file missing: not coming once it fails, told once, the bands still come
//   cap          path-nl held past LESSONS_WAIT: given up then (told), what's here studied; path-nl coming later is a content change, nothing told
//   remembered   a device whose last catalog listed no lessons pack: not coming before the sync (a start isn't held for nothing)
//   slow-first-run  a first run's questions on screen for 20 s (Home, drawn under them, asks): coming all along, the wait not started by
//                asking; it starts with the sync once the language is picked, so 14 s into it path-nl is still coming, then here, told once
//                (the packs.js from before started it at the first look and gave up during the questions: 8 Nov 2026)
//   switch       Dutch's lessons here, then Spanish picked 20 s on: Spanish's own wait starts at its own sync, path-es coming until it lands
// The packs.js from before (path-nl fetched last, the view told once at the end, no lessonsComing) fails "new" and "old-catalog".
// node scripts/test-lessons-first.mjs (exit 0 = pass)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const HERE = dirname(SELF);
const SCENARIOS = ["new", "old-catalog", "none", "unreachable", "refused", "cap", "remembered", "slow-first-run", "switch"];
const at = process.argv.indexOf("--scenario");

if (at < 0) {
  let passed = 0;
  let failed = 0;
  for (const scenario of SCENARIOS) {
    const run = spawnSync(process.execPath, [SELF, "--scenario", scenario], { encoding: "utf8", timeout: 300_000 });
    const lines = `${run.stdout}${run.stderr}`.split("\n").filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("ok")) passed++;
      if (line.startsWith("FAIL")) failed++;
      if (/^(ok|FAIL|  )/.test(line)) console.log(line);
    }
    if (run.status !== 0 && !lines.some((line) => line.startsWith("FAIL"))) {
      failed++;
      console.log(`FAIL  ${scenario}: the scenario ended with ${run.status ?? run.signal}: ${lines.slice(-3).join(" | ")}`);
    }
  }
  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

// ---------- one scenario, a fresh device ----------
const SCENARIO = process.argv[at + 1];
const memory = new Map();
if (SCENARIO === "remembered") memory.set("lx-lesson-packs", JSON.stringify({ nl: [] }));
globalThis.localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };

// The wait's timer, fired by hand, and a clock that can be put on (cap): every other timer as it is.
const realSetTimeout = globalThis.setTimeout;
let waitTimer = null;
let clockAhead = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockAhead;

await import("./fixtures/library-grammar.mjs");
const { BUILT_IN } = await import("../public/js/packs/index.js");
const { catalogueEntry, checkPack, packText, packUrl, packVersion, withPackEntry } = await import("../public/js/study/pack-format.js");
const packs = await import("../public/js/study/packs.js");
const { setLearning } = await import("../public/js/study/learning.js");
const content = await import("../public/js/study/content.js");
const path = await import("../public/js/study/path.js");
globalThis.setTimeout = (fn, ms, ...rest) => (ms === packs.LESSONS_WAIT ? ((waitTimer = fn), 0) : realSetTimeout(fn, ms, ...rest));

let failed = 0;
const check = (cond, name, detail = "") => {
  if (cond) console.log(`ok    ${SCENARIO}: ${name}`);
  else {
    failed++;
    console.log(`FAIL  ${SCENARIO}: ${name}${detail ? `: ${detail}` : ""}`);
  }
};
const until = async (cond, ms = 60_000) => {
  const end = realNow() + ms;
  while (!cond()) {
    if (realNow() > end) throw new Error("waited a minute");
    await new Promise((done) => realSetTimeout(done, 5));
  }
};

// The library: two word bands, then path-nl, as the live catalog lists them.
const read = (name) => JSON.parse(readFileSync(join(HERE, "../packs", name), "utf8"));
const builtIn = BUILT_IN.map((pack) => ({ ...pack, builtIn: true }));
const raws = [read("words-nl-01.json"), read("words-nl-02.json"), ...(SCENARIO === "none" ? [] : [read("path-nl.json")]), ...(SCENARIO === "switch" ? [read("path-es.json")] : [])];
const served = new Map();
let catalogue = { format: "lexicommons-catalogue", packs: {} };
const checked = [];
for (const raw of raws) {
  const { pack, errors } = checkPack(raw, { installed: [...builtIn, ...checked.map((p) => ({ ...p, builtIn: true }))] });
  if (!pack) throw new Error(`${raw.id} doesn't pass the check: ${errors[0]?.message}`);
  checked.push(pack);
}
const publish = async (pack) => {
  const version = await packVersion(pack);
  served.set(packUrl(pack.id, version), packText(pack));
  catalogue = withPackEntry(catalogue, pack.language ?? "nl", catalogueEntry(pack, version, {}));
  return version;
};
for (const pack of checked) await publish(pack);
if (SCENARIO === "old-catalog") catalogue = { ...catalogue, packs: { nl: catalogue.packs.nl.map(({ lessons: _lessons, ...entry }) => entry) } };
const catalogOrder = catalogue.packs.nl.map((entry) => entry.id);
let heldEs = null;
const lessonsCount = catalogue.packs.nl.find((entry) => entry.id === "path-nl")?.lessons;

const fetched = [];
let held = null;
globalThis.fetch = async (url) => {
  const where = String(url);
  fetched.push(where);
  if (where === "/library/catalogue.json") {
    if (SCENARIO === "unreachable") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(catalogue), { status: 200 });
  }
  if (where.includes("/packs/path-nl/")) {
    if (SCENARIO === "refused") return new Response("not here", { status: 404 });
    if (held) await held.promise;
  }
  if (where.includes("/packs/path-es/") && heldEs) await heldEs.promise;
  if (served.has(where)) return new Response(served.get(where), { status: 200 });
  return new Response("not here", { status: 404 });
};
packs.setFollowsSource(async () => []);

// What each listener heard, and what studying had then.
const heard = [];
const now = (kind) => ({
  kind,
  coming: packs.lessonsComing?.("nl"),
  missing: packs.lessonsMissing?.("nl"),
  first: path.pathLessons()[0]?.id ?? null,
  bands: content.PACKS.filter((pack) => pack.id.startsWith("words-nl-")).length,
  path: content.PACKS.some((pack) => pack.id === "path-nl"),
});
content.onContentChange(() => heard.push(now("content")));
// (Asked for as optional, so the packs.js from before fails on what it does, not on a missing name.)
packs.onLessonsComing?.(() => heard.push(now("told")));
const told = () => heard.filter((h) => h.kind === "told");
const packFetches = () => fetched.filter((url) => url.startsWith("/library/packs/")).map((url) => url.split("/")[3]);

setLearning("nl");
await packs.loadPacks();
const starterFirst = path.pathLessons()[0]?.id ?? null;

if (SCENARIO === "new" || SCENARIO === "old-catalog") {
  if (SCENARIO === "new") check(lessonsCount > 0 && lessonsCount === read("path-nl.json").lessons.length, "the catalog's entry says how many lessons path-nl carries (catalogueEntry)", String(lessonsCount));
  else check(lessonsCount === undefined, "a catalog from before: no entry says its lessons");
  check(packs.lessonsComing?.("nl") === true, "a new device, before any sync: its lessons are coming (it has never read the catalog)");
  check(Boolean(starterFirst) && !starterFirst.startsWith("path-nl/"), "meanwhile the path has only the starter's worked-out lessons (what must not be offered)", starterFirst);
  let release;
  held = { promise: new Promise((done) => (release = done)) };
  const sync = packs.syncLibraryPacks();
  await until(() => packFetches().length > 0);
  await new Promise((done) => realSetTimeout(done, 300));
  check(packFetches().join(",") === "path-nl", "path-nl fetched first, listed last in the catalog, and nothing else while it's held", packFetches().join(","));
  check(packs.lessonsComing?.("nl") === true && !told().length, "while it's held: still coming, nothing told");
  release();
  await sync;
  // (The first change studying hears with path-nl in it: the start's own changes came before.)
  const firstContent = heard.find((h) => h.kind === "content" && h.path);
  check(!heard.some((h) => h.path && h.coming), "never path-nl in what studying has while lessonsComing still says it's coming", JSON.stringify(heard.find((h) => h.path && h.coming)));
  check(firstContent?.path && firstContent.bands === 0, "studying has path-nl before any word band (its view published as soon as it's checked)", JSON.stringify(firstContent));
  check(firstContent?.first?.startsWith("path-nl/") && firstContent.coming === false, "where onContentChange first hears of it: the first lesson is path-nl's, and lessonsComing is false", JSON.stringify(firstContent));
  check(told().length === 1 && told()[0].coming === false && told()[0].first?.startsWith("path-nl/"), "told once, and told after studying had it", JSON.stringify(told()));
  check(path.pathLessons()[0]?.id === firstContent?.first, "after the sync, the same first lesson", `${path.pathLessons()[0]?.id} / ${firstContent?.first}`);
  check(heard.every((h) => h.missing === false) && packs.lessonsMissing?.("nl") === false, "never missing: coming, then here (lessonsMissing)", JSON.stringify(heard.find((h) => h.missing !== false)));
  // (The packs in the catalog's order, as today's app keeps them; content.js's view puts the lessons' pack first itself, as before.)
  const order = packs.allPacks().map((pack) => pack.id).filter((id) => catalogOrder.includes(id));
  check(JSON.stringify(order) === JSON.stringify(catalogOrder), "the packs in the catalog's order: path-nl last, as listed", order.join(","));
  check(packFetches().join(",") === ["path-nl", ...catalogOrder.filter((id) => id !== "path-nl")].join(","), "then the bands, in the catalog's order", packFetches().join(","));
  check(JSON.parse(memory.get("lx-lesson-packs") ?? "{}").nl?.join(",") === "path-nl", "which pack carries the lessons, kept for the next start", memory.get("lx-lesson-packs"));
  if (SCENARIO === "new") {
    // A returning device's syncs: a band's new version, then path-nl's. The lessons are here: nothing told, never coming.
    const band = checked[0];
    await publish({ ...band, about: `${band.about ?? ""} Again.` });
    const p = checked.at(-1);
    await publish({ ...p, about: `${p.about ?? ""} New.` });
    const before = told().length;
    await packs.syncLibraryPacks();
    check(told().length === before && packs.lessonsComing?.("nl") === false, "a later sync with new versions of a band and of path-nl: not coming, nothing told");
  }
}

if (SCENARIO === "none") {
  check(packs.lessonsComing?.("nl") === true, "a new device, before any sync: coming (it doesn't know yet)");
  const sync = packs.syncLibraryPacks();
  await until(() => fetched.includes("/library/catalogue.json") && told().length > 0);
  check(told()[0]?.coming === false, "once the catalog says no pack carries lessons: not coming, told", JSON.stringify(told()));
  await sync;
  check(told().length === 1 && content.PACKS.filter((pack) => pack.id.startsWith("words-nl-")).length === 2, "told once; the bands came", JSON.stringify(told()));
  check(JSON.parse(memory.get("lx-lesson-packs") ?? "{}").nl?.length === 0, "remembered: none for this language", memory.get("lx-lesson-packs"));
  check(packs.lessonsMissing?.("nl") === false && told()[0]?.missing === false, "none listed: nothing missing (there are none to miss)");
}

if (SCENARIO === "unreachable") {
  await packs.syncLibraryPacks();
  check(packs.lessonsComing?.("nl") === false && told().length === 1, "the catalog unreachable: not coming, told once (what's here is studied)", JSON.stringify(told()));
  check(packs.lessonsMissing?.("nl") === true && told()[0]?.missing === true, "and missing: the catalog never read on this device, no lessons here", JSON.stringify(told()));
}

if (SCENARIO === "refused") {
  await packs.syncLibraryPacks();
  check(packs.lessonsComing?.("nl") === false && told().length === 1, "path-nl's file missing: not coming, told once", JSON.stringify(told()));
  check(packs.lessonsMissing?.("nl") === true && told()[0]?.missing === true, "and missing where the turn is told: the catalog listed it, it isn't here", JSON.stringify(told()));
  check(packFetches()[0] === "path-nl" && content.PACKS.filter((pack) => pack.id.startsWith("words-nl-")).length === 2, "the bands came after it all the same", packFetches().join(","));
  check(!content.PACKS.some((pack) => pack.id === "path-nl") && path.pathLessons()[0]?.id === heard.at(-1)?.first, "what's here is studied: the starter's and the bands' lessons");
}

if (SCENARIO === "cap") {
  let release;
  held = { promise: new Promise((done) => (release = done)) };
  const sync = packs.syncLibraryPacks();
  await until(() => packFetches().includes("path-nl"));
  check(packs.lessonsComing?.("nl") === true && typeof waitTimer === "function", "path-nl held: coming, the wait's timer set");
  clockAhead = packs.LESSONS_WAIT + 1;
  waitTimer();
  check(packs.lessonsComing?.("nl") === false && told().length === 1 && told()[0].coming === false, "LESSONS_WAIT on: given up, told once", JSON.stringify(told()));
  check(!told()[0].first?.startsWith("path-nl/"), "then the path's first lesson is what's here (the starter's), as every card and the session start agree", told()[0].first);
  check(told()[0].missing === true, "missing once given up", JSON.stringify(told()[0]));
  release();
  await sync;
  check(told().length === 1 && packs.lessonsComing?.("nl") === false, "path-nl coming after: nothing told again, still not coming");
  check(heard.some((h) => h.kind === "content" && h.path && h.first?.startsWith("path-nl/")), "and studying takes it as any change (onContentChange)", JSON.stringify(heard.filter((h) => h.kind === "content").at(-1)));
  check(heard.find((h) => h.kind === "content" && h.path)?.missing === false && packs.lessonsMissing?.("nl") === false, "no longer missing where onContentChange hears they came", JSON.stringify(heard.find((h) => h.kind === "content" && h.path)));
}

if (SCENARIO === "remembered") {
  check(packs.lessonsComing?.("nl") === false && packs.lessonsMissing?.("nl") === false, "the last catalog listed no lessons pack for it: not coming, nothing missing, before the sync (a start isn't held for nothing)");
  await packs.syncLibraryPacks();
  check(packs.lessonsComing?.("nl") === false, "and after it, with path-nl listed now and here: not coming");
}

if (SCENARIO === "slow-first-run") {
  // The first run's two questions on screen; Home, drawn under them, asks. Nothing has been asked for: no language picked yet.
  check(packs.lessonsComing?.("nl") === true, "a first run on screen (Home asks under it): coming");
  clockAhead = 20_000;
  check(packs.lessonsComing?.("nl") === true, "20 s on, still on the questions: coming (the wait counts from the sync, not from a look)");
  check(!told().length, "nothing told meanwhile");
  // Dutch picked: the sync, with path-nl on its way.
  let release;
  held = { promise: new Promise((done) => (release = done)) };
  const sync = packs.syncLibraryPacks();
  await until(() => packFetches().includes("path-nl"));
  check(packs.lessonsComing?.("nl") === true && typeof waitTimer === "function", "the language picked, path-nl on its way: coming, the wait's timer set at the sync");
  clockAhead = 20_000 + packs.LESSONS_WAIT - 1000;
  check(packs.lessonsComing?.("nl") === true, "14 s into the sync (34 s after the first look): still coming");
  release();
  await sync;
  const firstContent = heard.find((h) => h.kind === "content" && h.path);
  check(firstContent?.first?.startsWith("path-nl/") && firstContent.coming === false, "path-nl in: the first lesson path-nl's lesson 1, lessonsComing false where studying hears it", JSON.stringify(firstContent));
  check(told().length === 1 && told()[0].coming === false && told()[0].first?.startsWith("path-nl/"), "told once, after studying had it", JSON.stringify(told()));
}

if (SCENARIO === "switch") {
  await packs.syncLibraryPacks();
  check(packs.lessonsComing?.("nl") === false && path.pathLessons()[0]?.id?.startsWith("path-nl/"), "Dutch's lessons here: not coming", path.pathLessons()[0]?.id);
  clockAhead = 20_000;
  check(packs.lessonsComing?.("es") === true, "Spanish, never synced on this device, 20 s on: coming (its own wait not started)");
  let release;
  heldEs = { promise: new Promise((done) => (release = done)) };
  waitTimer = null;
  setLearning("es");
  const sync = packs.syncLibraryPacks();
  await until(() => packFetches().includes("path-es"));
  check(packs.lessonsComing?.("es") === true && typeof waitTimer === "function", "Spanish picked, path-es on its way: coming, its wait's timer set at its own sync");
  clockAhead = 20_000 + packs.LESSONS_WAIT - 1000;
  check(packs.lessonsComing?.("es") === true, "14 s into Spanish's sync: still coming");
  release();
  await sync;
  check(packs.lessonsComing?.("es") === false && path.pathLessons()[0]?.id?.startsWith("path-es/"), "path-es in: not coming, the first lesson path-es's", path.pathLessons()[0]?.id);
  check(packs.lessonsComing?.("nl") === false, "Dutch unchanged: not coming");
}

process.exit(failed ? 1 : 0);
