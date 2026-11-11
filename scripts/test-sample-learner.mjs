// The sample learner (study/sample-mode.js, sample-learner.js, sample-start.js), in Node:
//   1. the learner each preset makes, from the real Dutch path and word packs: the same preset the same learner; every row and record as the
//      app keeps them, every unit a real one; days studied with gaps (a week away), sessions of different sizes, reading, listening and
//      talking mixed in; the done log matching the evidence day by day; lessons in the path's order, a few passed by; and read back by the
//      app's own sums (summary.js, the scheduler): about the words the preset names known, some slipping, a streak alive;
//   2. the mode, in a child process with every store and the network stood in: while it's on, the progress stores it opens and the keys it
//      writes are the sample's own, the person's keys stay byte for byte, and nothing goes out (sync with a connected storage, the study
//      record for an AI, the reminders report, an error report, practices collected, the practice snapshot, the account's clears); a reading
//      place stays put. Its control: the same run with the switch off must fail every one of those, and four planted copies (the keys not
//      the sample's, then sync's, the study record's and the practice collection's guard each taken out) must each be caught;
//   3. the source: no module names one of these stores but through sampleKey / sampleDb (a planted line caught), practice/home.js refusing a
//      practice before it posts; Off: the switch and every sample key gone, the person's keys as they were.
// node scripts/test-sample-learner.mjs --list <frequency.nl.json>   (exit 0 = pass)
// (Run with --scenario <sample|real> <app dir>, it's the child: one run of the mode, printed as JSON.)

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const DAY = 86_400_000;

// ---------- the child: one run of the mode ----------

// The person's own data on the device before the switch, as it might be.
const REAL = {
  "lx.streak.v1": JSON.stringify({ things: { "session:0123456789abcdef": { at: 1762000000000, day: "2025-11-01" } }, pauses: {} }),
  "lx.streak.since": "1761000000000",
  "lx.path.v1": JSON.stringify({ nl: { lesson: null, at: 1, marked: [] } }),
  "lx.learning.v1": JSON.stringify({ lang: "nl", from: "en" }),
  "lx.study.focus.v1": JSON.stringify({}),
  "lx.reader.bank.v1": JSON.stringify({ nl: { boek: { at: 1 } } }),
  "lx.ai.record.v1": JSON.stringify({ device: "00112233aabbccdd" }),
  "lx.reminders.on": "1",
  "lx.sync.v1": JSON.stringify({}),
  "lx.sync.device.v1": "a1b2c3d4",
  "lc_storage_dropbox": JSON.stringify({ accessToken: "fake-access", refreshToken: "fake-refresh", expiresAt: Date.now() + 3_600_000 }),
};

async function scenario(mode, appDir) {
  const store = new Map(Object.entries(REAL));
  if (mode === "sample") store.set("lx.sample.v1", JSON.stringify({ preset: "months", at: Date.now() }));
  const written = new Set();
  const opened = [];
  const deleted = [];
  const channels = [];
  const fetched = [];
  const errors = [];
  const listeners = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => (written.add(k), store.set(k, String(v))),
    removeItem: (k) => (written.add(k), store.delete(k)),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  // Object.keys(localStorage) reads its own keys: give the stand-in them.
  globalThis.localStorage = new Proxy(globalThis.localStorage, {
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: (target, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : Reflect.getOwnPropertyDescriptor(target, k)),
  });
  // IndexedDB: every open is told (and refused, so every store keeps to memory); nothing is kept.
  globalThis.indexedDB = {
    open(name) {
      opened.push(name);
      const request = {};
      setTimeout(() => {
        request.error = new Error("no IndexedDB here");
        request.onerror?.();
      }, 0);
      return request;
    },
    deleteDatabase(name) {
      deleted.push(name);
      const request = {};
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    },
    databases: async () => [],
  };
  globalThis.BroadcastChannel = class {
    constructor(name) {
      channels.push(name);
    }
    postMessage() {}
    close() {}
  };
  globalThis.fetch = async (url, init = {}) => {
    fetched.push(`${init.method ?? "GET"} ${String(url)}`);
    const body = /\/api\/practice$/.test(String(url)) ? [] : /\/api\/progress\/clears/.test(String(url)) ? [] : {};
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob([JSON.stringify(body)]), headers: new Map() };
  };
  globalThis.addEventListener = (type, fn) => (listeners.get(type) ?? listeners.set(type, []).get(type)).push(fn);
  globalThis.location = { pathname: "/app/", hash: "#today", href: "http://localhost/app/", origin: "http://localhost", assign() {}, reload() {} };
  globalThis.document = { addEventListener() {}, querySelector: () => null, hidden: false, visibilityState: "visible" };
  globalThis.ErrorEvent = class {
    constructor(type, init) {
      Object.assign(this, { type, ...init });
    }
  };
  const mod = (path) => import(pathToFileURL(join(appDir, "public/js", path)).href);
  // In the order the tests load them (plan.js before packs.js).
  const progress = await mod("study/progress.js");
  await mod("study/plan.js");
  const done = await mod("study/done.js");
  const pathPlace = await mod("study/path-place.js");
  const learning = await mod("study/learning.js");
  const focus = await mod("study/concept-focus.js");
  const bank = await mod("read/bank.js");
  const highlights = await mod("read/highlights.js");
  const readStore = await mod("read/store.js");
  const practiceStore = await mod("practice/store.js");
  const learner = await mod("practice/learner.js");
  const layout = await mod("shell/layout.js");
  const studyRecord = await mod("ai/study-record.js");
  const push = await mod("push.js");
  await mod("lx/error-report.js");
  const sync = await mod("sync.js");
  const attempt = async (what, fn) => {
    try {
      await fn();
    } catch (error) {
      errors.push(`${what}: ${error?.message ?? error}`);
    }
  };
  // Studying, as a session and the reader would.
  await attempt("record", () => progress.record([{ concept: "w:huis", outcome: "right", test: "recall", skill: "read", activity: "type", item: "x" }]));
  await attempt("finished", () => done.finishedSession());
  await attempt("pause", () => done.addPause("2030-01-02", "2030-01-04"));
  await attempt("place", () => pathPlace.setPlace("nl", "path-nl/somewhere"));
  await attempt("learning", () => learning.setLearning("nl", "en"));
  await attempt("focus", () => focus.setFocus(["word-order"]));
  await attempt("bank", () => bank.addWord("nl", "fiets"));
  await attempt("highlight", () => highlights.saveHighlight({ id: "h1", book: "a-book", version: null, start: 1, end: 2, quote: "x", note: "", at: Date.now() }));
  await attempt("position", () => readStore.setPosition("a-book", 12, null));
  await attempt("touch", () => readStore.touchBook("a-book"));
  // What goes out.
  await attempt("collect", () => practiceStore.collectFinished());
  await attempt("learner", () => learner.sendLearner());
  layout.setAiConnected(true);
  await attempt("study record", () => studyRecord.flushStudyRecord());
  await attempt("reminders", () => push.report());
  for (const fn of listeners.get("error") ?? []) fn(new ErrorEvent("error", { error: new Error("a planted failure"), message: "a planted failure", filename: "http://localhost/js/x.js", lineno: 1, colno: 1 }));
  await attempt("clears", () => progress.refreshClears());
  await attempt("clear everywhere", () => progress.clearProgress({ everywhere: true }));
  await attempt("sync", async () => {
    await sync.startSync({ account: "an-account" });
    await sync.syncNow();
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const changed = Object.keys(REAL).filter((key) => store.get(key) !== REAL[key]);
  return { mode, opened, deleted, channels, fetched, written: [...written], changed, errors };
}

if (process.argv[2] === "--scenario") {
  const result = await scenario(process.argv[3], process.argv[4]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

// ---------- the checks ----------

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

/** What a run of the mode did that the sample learner must never do: [] when nothing. */
const OUTBOUND = [
  [/\/api\/ai\/record/, "the study record for an AI"],
  [/\/api\/reminders/, "the reminders report"],
  [/\/api\/errors/, "an error report"],
  [/\/api\/practice\b/, "the practice room (collecting, or the snapshot)"],
  [/\/api\/progress\/clears/, "the account's clears"],
  [/dropbox|googleapis|graph\.microsoft|\/api\/storage/, "your storage (sync)"],
];
function leaks(run) {
  const out = [];
  for (const name of run.opened) if (!name.endsWith(".sample")) out.push(`opened ${name}`);
  for (const name of run.channels) if (!name.endsWith(".sample")) out.push(`a channel to other tabs named ${name}`);
  for (const key of run.written) if (!key.startsWith("lx.sample:")) out.push(`wrote ${key}`);
  for (const key of run.changed) out.push(`changed ${key}`);
  for (const call of run.fetched) for (const [re, what] of OUTBOUND) if (re.test(call)) out.push(`sent ${what} (${call})`);
  return [...new Set(out)];
}
const runScenario = (mode, dir) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--scenario", mode, dir], { encoding: "utf8", maxBuffer: 1 << 24 }).trim().split("\n").at(-1));

// A copy of this app's code with one change made, for a plant: public/js copied, public/vendor linked.
function planted(changes) {
  const dir = mkdtempSync(join(tmpdir(), "sample-plant-"));
  cpSync(join(APP, "public/js"), join(dir, "public/js"), { recursive: true });
  symlinkSync(join(APP, "public/vendor"), join(dir, "public/vendor"));
  for (const [file, from, to] of changes) {
    const path = join(dir, "public/js", file);
    const text = readFileSync(path, "utf8");
    if (!text.includes(from)) throw new Error(`the plant's text isn't in ${file} any more: ${from.slice(0, 60)}`);
    writeFileSync(path, text.replace(from, to));
  }
  return dir;
}

// ---------- 2. the mode ----------

await test("while it's on, only the sample's own stores are opened and written, the person's keys stay byte for byte, and nothing goes out", () => {
  const run = runScenario("sample", APP);
  const found = leaks(run);
  ok(found.length === 0, found.join("; "));
  ok(run.opened.includes("lexicommons-study.sample"), `the sample's evidence store was never opened (opened: ${run.opened.join(", ") || "nothing"})`);
  ok(run.written.includes("lx.sample:lx.streak.v1"), "the done log never reached the sample's own key");
  ok(run.channels.includes("lx-progress.sample"), `the tabs' channel: ${run.channels.join(", ")}`);
  ok(!run.opened.includes("lexicommons-read"), "a reading place or a book's order was written");
  ok(run.errors.some((e) => e.startsWith("clear everywhere: Turn the sample learner off first")), `clearing everywhere wasn't refused in words: ${run.errors.join("; ")}`);
  return `${run.opened.length} stores opened (${[...new Set(run.opened)].join(", ")}), ${run.written.length} keys written, ${run.fetched.length} calls, none of them out`;
});

await test("its control: the same run with the switch off writes the person's stores and sends every one of those, and is caught", () => {
  const run = runScenario("real", APP);
  const found = leaks(run);
  const need = ["opened lexicommons-study", "wrote lx.streak.v1", "changed lx.path.v1", "the study record for an AI", "the reminders report", "an error report", "the practice room", "the account's clears", "your storage (sync)"];
  const missed = need.filter((what) => !found.some((f) => f.includes(what)));
  ok(missed.length === 0, `the checker didn't see: ${missed.join(", ")} (it saw: ${found.join("; ")})`);
  return `${found.length} leaks seen`;
});

const PLANTS = [
  ["the sample's keys made the person's own", [["study/sample-mode.js", "export const sampleKey = (key) => (atStart ? `${SAMPLE_PREFIX}${key}` : key);", "export const sampleKey = (key) => key;"], ["study/sample-mode.js", "export const sampleDb = (name) => (atStart ? `${name}${SAMPLE_DB_SUFFIX}` : name);", "export const sampleDb = (name) => name;"]], ["wrote lx.streak.v1", "opened lexicommons-study"]],
  ["sync's guard taken out", [["sync.js", "  if (sampleOn()) {\n    status = { ...status, syncing: false, error: \"Paused while the sample learner is on.\" };\n    tell();\n    return Promise.resolve(syncStatus());\n  }\n", ""], ["sync.js", '  if (sampleOn()) return "Paused while the sample learner is on.";\n', ""], ["sync.js", "  if (started || !account || sampleOn()) return;", "  if (started || !account) return;"], ["sync.js", "  if (!accountTag || sampleOn()) return;", "  if (!accountTag) return;"]], ["your storage (sync)"]],
  ["the study record's guard taken out", [["ai/study-record.js", "  if (sampleOn()) return;\n", ""]], ["the study record for an AI"]],
  ["the practice collection's guard taken out", [["practice/store.js", "  if (sampleOn()) return Promise.resolve({ count: 0, open: [] });\n", ""]], ["the practice room"]],
];
for (const [name, changes, expect] of PLANTS) {
  await test(`a plant is caught: ${name}`, () => {
    const dir = planted(changes);
    try {
      const found = leaks(runScenario("sample", dir));
      const missed = expect.filter((what) => !found.some((f) => f.includes(what)));
      ok(missed.length === 0, `not caught: ${missed.join(", ")} (seen: ${found.join("; ") || "nothing"})`);
      return found.filter((f) => expect.some((what) => f.includes(what))).join("; ");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

// ---------- 3. the source, and Off ----------

// Every store the sample has its own of, by the name it has as the person's.
const STORES = ["lx.streak.v1", "lx.streak.since", "lx.path.v1", "lx.learning.v1", "lx.study.focus.v1", "lx.reader.bank.v1", "lx.reader.notyet.v1", "lx.reader.suggest.v1", "lx.today.thrown", "lx.know.pile.v2", "lx.know.pile.v3", "lexicommons-study", "lexicommons-practice", "lexicommons-highlights", "lx-progress"];
// Where a name may stand alone: the list of names itself, and a first run reading (never writing) whether a language was chosen.
const NAMED_ALONE = { "study/done.js": ["lx.streak.v1", "lx.streak.since"], "study/sample-mode.js": ["lexicommons-study", "lexicommons-practice", "lexicommons-highlights"], "study/sample-start.js": [], "shell/welcome.js": ["lx.learning.v1"] };
// One line that may name a store alone, exactly as it is (any other line of its file still counts): theme-boot.js's test, before the first
// paint, of whether a newcomer's first run is coming (neither key kept), which only decides whether they see the splash. It's a classic boot
// script that can't import sampleKey, and the sample learner is never a newcomer (an admin who has studied, with a language chosen).
// And report.js, the signed-out Report a bug page (/report; a signed-in visitor is sent to Settings' own form), reading which languages this
// device last had: it runs only signed out, and signing out turns the sample off, so the person's own key is the only one there is.
const NAMED_LINE = {
  "lx/theme-boot.js": ['var newcomer = !installed && !localStorage.getItem("lx.welcome.v1") && !localStorage.getItem("lx.learning.v1");'],
  "report.js": ['const kept = JSON.parse(localStorage.getItem("lx.learning.v1") ?? "null");'],
};
function strays(files) {
  const out = [];
  for (const [file, text] of files) {
    text.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (/^\s*\*/.test(line)) return;
      for (const name of STORES) {
        if (!new RegExp(`["\`]${name.replace(/\./g, "\\.")}[":\`$]`).test(code)) continue;
        if (/sampleKey\(|sampleDb\(|SAMPLE_DB_SUFFIX|SAMPLE_PREFIX/.test(code) || (NAMED_ALONE[file] ?? []).includes(name) || (NAMED_LINE[file] ?? []).includes(code.trim())) continue;
        out.push(`${file}:${i + 1} names ${name}`);
      }
    });
  }
  return out;
}
const sources = () => {
  const out = [];
  const walk = (dir, rel = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${rel}${entry.name}/`);
      else if (entry.name.endsWith(".js")) out.push([`${rel}${entry.name}`, readFileSync(join(dir, entry.name), "utf8")]);
    }
  };
  walk(join(APP, "public/js"));
  return out;
};
await test("no module names a store the sample has its own of but through sampleKey or sampleDb (a planted line is caught)", () => {
  const files = sources();
  const found = strays(files);
  ok(found.length === 0, found.join("; "));
  const plant = strays([["study/a-plant.js", 'localStorage.setItem("lx.streak.v1", JSON.stringify(log));\nconst db = indexedDB.open("lexicommons-study", 2);']]);
  ok(plant.length === 2, `the plant wasn't caught: ${JSON.stringify(plant)}`);
  // theme-boot.js's one line is all it's allowed: another of its lines naming the store is caught, and so is that line in another file.
  const exact = 'var newcomer = !installed && !localStorage.getItem("lx.welcome.v1") && !localStorage.getItem("lx.learning.v1");';
  const lines = strays([["lx/theme-boot.js", `${exact}\nlocalStorage.setItem("lx.learning.v1", "nl");`], ["lx/other.js", exact]]);
  ok(lines.length === 2 && lines.some((l) => l.startsWith("lx/theme-boot.js:2")) && lines.some((l) => l.startsWith("lx/other.js:1")), `theme-boot's exemption reached past its line: ${JSON.stringify(lines)}`);
  return `${files.length} modules read`;
});

await test("a practice with an AI is refused before it's posted, while it's on", () => {
  const text = readFileSync(join(APP, "public/js/practice/home.js"), "utf8");
  const guard = text.indexOf("if (sampleOn()) throw new Error(");
  const post = text.indexOf('post("/api/practice", {');
  ok(guard > 0 && post > guard && text.slice(guard, post).split("\n").length < 12, `the guard ${guard < 0 ? "is missing" : "isn't just before the post"}`);
});

// ---------- 1. the learner ----------

const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-sample-learner.mjs --list <frequency.nl.json>");
  process.exit(2);
}
const { cleanRow, record, clearProgress, unitState, studiedUnits, unitEvidence, gradeOf } = await import("../public/js/study/progress.js");
const { replay, strengthAt } = await import("../public/js/study/scheduler.js");
await import("../public/js/study/plan.js");
const content = await import("../public/js/study/content.js");
const { savePack } = await import("../public/js/study/packs.js");
const { useFrequency } = await import("../public/js/study/frequency.js");
const { pathLessons } = await import("../public/js/study/path.js");
const { targetOf } = await import("../public/js/study/new-words.js");
const summary = await import("../public/js/know/summary.js");
const { checkRecord, dayKey, streakOf, addDays } = await import("../public/js/know/streak.js");
const S = await import("../public/js/study/sample-learner.js");
for (const name of readdirSync(join(APP, "packs")).filter((n) => /^(path-nl|words-nl-\d+)\.json$/.test(n)).sort()) {
  const saved = await savePack(JSON.parse(readFileSync(join(APP, "packs", name), "utf8")));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));
const lessons = pathLessons();
const course = S.courseOf({ lang: "nl", lessons, items: content.ITEMS, sentenceUnits: content.sentenceUnits, conceptsOf: content.conceptsOf, targetOf });
const NOW = new Date(2026, 10, 6, 15, 0).getTime();
const TARGET = { weeks: 150, months: 900, year: 2500 };
const hashOf = (learner) => createHash("sha256").update(JSON.stringify(learner)).digest("hex");

await test("the same preset makes the same learner; another preset another", () => {
  const a = hashOf(S.sampleLearner("months", course, { now: NOW }));
  const b = hashOf(S.sampleLearner("months", course, { now: NOW }));
  const c = hashOf(S.sampleLearner("weeks", course, { now: NOW }));
  ok(a === b, "two makes of one preset differ");
  ok(a !== c, "two presets made the same learner");
  return a.slice(0, 12);
});

const units = new Set([...course.items.flatMap((item) => [...item.units, ...item.words]), ...course.lessons.flatMap((l) => [...l.units, ...(l.idea ? [l.idea] : [])])]);
const itemIds = new Set(course.items.map((item) => item.id));
for (const preset of S.SAMPLE_PRESETS) {
  const L = S.sampleLearner(preset.id, course, { now: NOW });
  const today = dayKey(NOW);
  const dayOf = (at) => dayKey(at);

  await test(`${preset.name}: every row and record as the app keeps them, every unit and sentence a real one`, () => {
    const uids = new Set();
    let last = 0;
    for (const row of L.evidence) {
      ok(cleanRow(row), `a row the app wouldn't take: ${JSON.stringify(row)}`);
      ok(/^[0-9a-f]{16}$/.test(row.uid) && !uids.has(row.uid), `a uid: ${row.uid}`);
      uids.add(row.uid);
      ok(row.at >= last, "rows out of time order");
      last = row.at;
      ok(row.at < NOW && dayOf(row.at) < today && row.at > NOW - (preset.days + 2) * DAY, `a row out of its days: ${new Date(row.at).toISOString()}`);
      ok(units.has(row.concept), `a unit that isn't in the course: ${row.concept}`);
      if (row.item && row.activity !== "reader" && !row.activity.startsWith("practice:")) ok(itemIds.has(row.item), `a sentence that isn't in the packs: ${row.item}`);
    }
    for (const [key, thing] of Object.entries(L.done.things)) ok(checkRecord({ at: thing.at, value: { day: thing.day } }, key) && thing.day === dayOf(thing.at), `a finished thing: ${key} ${JSON.stringify(thing)}`);
    for (const [id, p] of Object.entries(L.done.pauses)) ok(checkRecord({ at: p.at, value: { from: p.from, to: p.to } }, `pause:${id}`), `a pause: ${JSON.stringify(p)}`);
    return `${L.evidence.length.toLocaleString()} rows, ${Object.keys(L.done.things).length} things`;
  });

  await test(`${preset.name}: most days studied, with gaps; sessions of many sizes; reading, listening and talking mixed in`, () => {
    const days = [...new Set(L.evidence.map((row) => dayOf(row.at)))].sort();
    const share = days.length / preset.days;
    ok(share > 0.6 && share < 0.96, `days studied: ${days.length} of ${preset.days}`);
    let longest = 0;
    for (let i = 1; i < days.length; i++) {
      let gap = 0;
      for (let d = days[i - 1]; addDays(d, 1) < days[i]; d = addDays(d, 1)) gap++;
      longest = Math.max(longest, gap);
    }
    if (preset.breaks.length) ok(longest >= 7, `the longest gap is ${longest} days: no week away`);
    else ok(longest >= 1, "not one day off");
    ok(dayOf(L.evidence.at(-1).at) === addDays(today, -1), "the last day studied isn't yesterday");
    const answersPerDay = new Map();
    for (const row of L.evidence) answersPerDay.set(dayOf(row.at), (answersPerDay.get(dayOf(row.at)) ?? new Set()).add(row.uid.slice(0, 12)));
    const sizes = [...answersPerDay.values()].map((s) => s.size).sort((a, b) => a - b);
    // Sessions of many sizes, by the spread of answers a day (their coefficient of variation, every day studied), not by one ratio at the edge:
    // a seeded draw that follows the path's content tipped that either way (7 Nov: the busiest day 4.1× the tenth percentile on today's
    // path-nl, 2.99× with 65 sentences more; the spread 0.36 and 0.30, and 0.30–0.53 across the presets). Its control: days all of one size.
    const SPREAD = 0.2;
    const spread = (list) => {
      const mean = list.reduce((sum, n) => sum + n, 0) / list.length;
      return Math.sqrt(list.reduce((sum, n) => sum + (n - mean) ** 2, 0) / list.length) / mean;
    };
    ok(spread(sizes.map(() => sizes[Math.floor(sizes.length / 2)])) < SPREAD, "the spread's control: days all of one size pass");
    ok(spread(sizes) >= SPREAD, `the days are too alike: a spread of ${spread(sizes).toFixed(2)}, under ${SPREAD} (${sizes[0]}…${sizes.at(-1)} answers a day)`);
    const graded = L.evidence.filter((row) => row.outcome !== "met");
    const wrong = graded.filter((row) => row.outcome === "wrong").length / graded.length;
    ok(wrong > 0.05 && wrong < 0.2, `wrong answers: ${(wrong * 100).toFixed(1)}%`);
    for (const skill of ["hear", "say"]) ok(graded.filter((row) => row.skill === skill).length / graded.length > 0.04, `too few answers by ${skill}`);
    ok(graded.some((row) => row.how === "spoken"), "nothing said aloud");
    if (preset.reading) ok(L.evidence.some((row) => row.activity === "reader") && Object.keys(L.done.things).some((k) => k.startsWith("read:")), "no reading");
    if (preset.talk) ok(Object.keys(L.done.things).some((k) => k.startsWith("talk:")), "no conversation");
    ok(Object.keys(L.done.pauses).length === preset.breaks.filter((b) => b.paused).length, "its pauses");
    return `${days.length} days, longest gap ${longest}, ${sizes[0]}–${sizes.at(-1)} answers a day, ${(wrong * 100).toFixed(1)}% wrong`;
  });

  await test(`${preset.name}: the done log matches the evidence, day by day`, () => {
    const evidenceDays = new Set(L.evidence.map((row) => dayOf(row.at)));
    const thingDays = new Set(Object.values(L.done.things).map((t) => t.day));
    const without = [...evidenceDays].filter((d) => !thingDays.has(d));
    const empty = [...thingDays].filter((d) => !evidenceDays.has(d));
    ok(!without.length, `days studied with nothing finished: ${without.join(", ")}`);
    ok(!empty.length, `days with something finished and no answer: ${empty.join(", ")}`);
    // Reading: the day's 5-minute blocks, counted as done.js counts them from the pages' moments.
    for (const day of [...new Set(L.evidence.filter((r) => r.activity === "reader").map((r) => dayOf(r.at)))]) {
      const moments = [...new Set(L.evidence.filter((r) => r.activity === "reader" && dayOf(r.at) === day).map((r) => r.at))].sort((a, b) => a - b);
      let ms = 0;
      for (let i = 1; i < moments.length; i++) ms += Math.min(180_000, moments[i] - moments[i - 1]);
      const blocks = Object.keys(L.done.things).filter((k) => k.startsWith(`read:${day}#`)).length;
      ok(blocks === Math.floor(ms / 300_000), `${day}: ${blocks} reading things for ${Math.round(ms / 60000)} minutes`);
    }
    for (const key of Object.keys(L.done.things).filter((k) => k.startsWith("talk:"))) {
      const turns = [...new Set(L.evidence.filter((r) => r.practice === key.slice(5)).map((r) => r.at))].sort((a, b) => a - b);
      ok(turns.length >= 3 && L.done.things[key].at === turns[2], `${key}: ${turns.length} turns`);
    }
    return `${thingDays.size} days`;
  });

  await test(`${preset.name}: lessons in the path's order, now and then one passed by`, () => {
    const done = Object.keys(L.done.things).filter((k) => k.startsWith("lesson:")).map((k) => decodeURIComponent(k.slice(7)));
    const at = done.map((id) => lessons.findIndex((l) => l.id === id));
    ok(at.every((i) => i >= 0), "a lesson that isn't on the path");
    const byTime = Object.entries(L.done.things).filter(([k]) => k.startsWith("lesson:")).sort((a, b) => a[1].at - b[1].at).map(([k]) => lessons.findIndex((l) => l.id === decodeURIComponent(k.slice(7))));
    ok(byTime.every((i, n) => n === 0 || i > byTime[n - 1]), "lessons out of the path's order");
    const furthest = Math.max(...at);
    const passed = lessons.slice(0, furthest).filter((l, i) => !done.includes(l.id) && i < furthest).length;
    ok(passed / furthest < 0.06, `${passed} of ${furthest} passed by`);
    return `${done.length} lessons, ${passed} passed by`;
  });

  await test(`${preset.name}: read back by the app's own sums: about ${TARGET[preset.id].toLocaleString()} words known, some slipping, the streak alive`, async () => {
    await clearProgress();
    for (let i = 0; i < L.evidence.length; i += 20_000) record(L.evidence.slice(i, i + 20_000).map(({ uid: _uid, ...row }) => row));
    const k = summary.knowledge({ lang: "nl", now: NOW });
    const words = k.kinds.word;
    ok(Math.abs(words.known - TARGET[preset.id]) / TARGET[preset.id] < 0.15, `words known: ${words.known}`);
    const slipping = words.slipping / words.started;
    ok(slipping > 0.01 && slipping < 0.22, `slipping: ${words.slipping} of ${words.started}`);
    const ideas = summary.grammarMap({ lang: "nl", now: NOW }).filter((row) => row.state !== "new").length;
    ok(ideas >= (preset.id === "weeks" ? 10 : 25), `ideas met: ${ideas}`);
    const g = summary.growth({ lang: "nl", now: NOW, days: 28 });
    ok(g.at(-1).n >= g[0].n, `over the last four weeks, fewer known: ${g[0].n} → ${g.at(-1).n}`);
    const perDay = {};
    for (const t of Object.values(L.done.things)) perDay[t.day] = (perDay[t.day] ?? 0) + 1;
    const s = streakOf({ things: perDay, before: [], pauses: Object.values(L.done.pauses), today: dayKey(NOW) });
    ok(s.days >= preset.run, `the streak: ${s.days} days`);
    // Every unit it studied is one the app can open (a word, a phrase, an idea).
    const kinds = new Set(studiedUnits("nl").map((u) => u[0]));
    ok([...kinds].every((kind) => "wpc".includes(kind)), `units of an unknown kind: ${[...kinds]}`);
    ok(unitState(studiedUnits("nl").find((u) => u.startsWith("w:")), { lang: "nl", now: NOW }).reviews > 0, "a word with no reviews");
    return `${words.known} words known, ${words.slipping} of ${words.started} slipping, ${ideas} ideas met, a ${s.days}-day streak`;
  });

  // 6 Nov 2026: a year in, Knowledge's ideas read "Just started · 5,787 of 6,102 right", every answer on an idea moving its card
  // (scheduler.js: ideas are scheduled on their rate now).
  await test(`${preset.name}: an idea answered 50 times or more, 85% right or better, is Strong or Solid; counted answer by answer, as before, one wasn't`, async () => {
    await clearProgress();
    for (let i = 0; i < L.evidence.length; i += 20_000) record(L.evidence.slice(i, i + 20_000).map(({ uid: _uid, ...row }) => row));
    const LEVEL = ["Not seen yet", "Just started", "Getting there", "Strong", "Solid"];
    const ideas = studiedUnits("nl")
      .filter((unit) => unit.startsWith("p:"))
      .map((unit) => ({ unit, s: unitState(unit, { lang: "nl", now: NOW }) }))
      .filter(({ s }) => s.reviews >= 50 && s.right / s.reviews >= 0.85);
    // Enough of them that it says something: three weeks in, the few answered that often (four, 7 Nov 2026).
    ok(ideas.length >= 3, `only ${ideas.length} ideas answered that much and that well`);
    const weak = ideas.filter(({ s }) => s.level < 3);
    ok(!weak.length, `not past Getting there: ${weak.map(({ unit, s }) => `${unit} ${LEVEL[s.level]} · ${s.right} of ${s.reviews} right`).join(", ")}`);
    // The control: the same answers, each one moving the card (a word's rule, which ideas had before).
    const before = ideas.map(({ unit }) => {
      const reviews = unitEvidence(unit, "nl").flatMap((row) => (gradeOf(row) ? [{ at: row.at, skill: row.skill, grade: gradeOf(row), spoken: row.how === "spoken" || row.activity === "say" }] : []));
      return strengthAt("w", replay(`w:${unit.slice(2)}`, reviews).strengths.read, NOW).level;
    });
    ok(before.some((level) => level < 3), `answer by answer, every one was Strong or Solid too: ${before}`);
    const top = ideas.sort((a, b) => b.s.reviews - a.s.reviews)[0];
    return `${ideas.length} ideas, ${top.unit} ${LEVEL[top.s.level]} · ${top.s.right.toLocaleString()} of ${top.s.reviews.toLocaleString()} right; answer by answer ${before.filter((level) => level < 3).length} under Strong`;
  });
}

// ---------- Off ----------

await test("Off: the switch and every sample key go, and the person's keys are as they were", async () => {
  const store = new Map(Object.entries(REAL));
  store.set("lx.sample.v1", JSON.stringify({ preset: "year", at: Date.now() }));
  store.set("lx.sample:lx.streak.v1", "{}");
  store.set("lx.sample:lx.path.v1", "{}");
  globalThis.localStorage = new Proxy(
    { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)) },
  );
  const deleted = [];
  globalThis.indexedDB = {
    deleteDatabase(name) {
      deleted.push(name);
      return {
        set onsuccess(fn) {
          setTimeout(fn, 0);
        },
      };
    },
    databases: async () => [],
  };
  const before = createHash("sha256").update(JSON.stringify(Object.keys(REAL).map((k) => [k, store.get(k)]))).digest("hex");
  // A fresh copy of the module (the one the learner's part loaded started with the switch off).
  const { turnSampleOff } = await import(`${pathToFileURL(join(APP, "public/js/study/sample-mode.js")).href}?off`);
  await turnSampleOff();
  const after = createHash("sha256").update(JSON.stringify(Object.keys(REAL).map((k) => [k, store.get(k)]))).digest("hex");
  ok(!store.has("lx.sample.v1"), "the switch is still on");
  ok(![...store.keys()].some((k) => k.startsWith("lx.sample:")), "a sample key is left");
  ok(before === after, "the person's keys changed");
  ok(["lexicommons-study.sample", "lexicommons-practice.sample", "lexicommons-highlights.sample"].every((n) => deleted.includes(n)), `databases deleted: ${deleted.join(", ")}`);
  return `hash ${after.slice(0, 12)} before and after`;
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
