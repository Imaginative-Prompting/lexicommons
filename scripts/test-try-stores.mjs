// The try-out's stores (study/sample-mode.js demoPage, sampleKey, sampleDb): the page's address alone decides it, never a stored switch.
// /try/ uses stores of its own (lx.try:…, ….try), whatever the sample learner's switch says; /app/ never does, with the switch or without;
// an address that only starts like it (/tryout, /try-me) isn't it. Nothing goes out from it but error reports (lx/error-report.js), and the
// first run's "done" and language are its own (shell/welcome.js), so a try-out never marks the browser's real first run done. Each case a
// fresh copy of the module with that address and that switch. Another copy's dir to see it fail on one from before:
//   node scripts/test-try-stores.mjs [<app dir>]   (exit 0 = pass)
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const APP = process.argv[2] ? pathToFileURL(`${resolve(process.argv[2])}/`) : new URL("../", import.meta.url);
let failed = 0;
let passed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}
// A stand-in localStorage whose keys are its own properties, as a browser's are (Object.keys lists them).
class Store {
  getItem(k) {
    return Object.hasOwn(this, k) ? this[k] : null;
  }
  setItem(k, v) {
    this[k] = String(v);
  }
  removeItem(k) {
    delete this[k];
  }
}
globalThis.localStorage = new Store();
const stored = {
  clear: () => Object.keys(localStorage).forEach((k) => delete localStorage[k]),
  set: (k, v) => localStorage.setItem(k, v),
  keys: () => Object.keys(localStorage),
};
let n = 0;
async function at(pathname, { sample = false } = {}) {
  stored.clear();
  if (sample) stored.set("lx.sample.v1", JSON.stringify({ preset: "weeks", at: 1 }));
  globalThis.location = new URL(`https://lexicommons.test${pathname}`);
  const m = await import(`${new URL("public/js/study/sample-mode.js", APP).href}?case=${++n}`);
  return {
    demo: typeof m.demoPage === "function" ? m.demoPage() : false,
    on: m.sampleOn(),
    key: m.sampleKey("lx.learning.v1"),
    db: m.sampleDb("lexicommons-study"),
  };
}
check("/try/: the try-out's own stores, nothing sent", await at("/try/"), { demo: true, on: true, key: "lx.try:lx.learning.v1", db: "lexicommons-study.try" });
check("/try (no slash) and /try/index.html: the same", [await at("/try"), await at("/try/index.html")].map((s) => s.key), ["lx.try:lx.learning.v1", "lx.try:lx.learning.v1"]);
check("/try/ with the sample learner's switch on: still the try-out's own, never the sample's", await at("/try/", { sample: true }), { demo: true, on: true, key: "lx.try:lx.learning.v1", db: "lexicommons-study.try" });
check("/app/: the real stores", await at("/app/"), { demo: false, on: false, key: "lx.learning.v1", db: "lexicommons-study" });
check("/app/ with the sample learner's switch on: the sample's, never the try-out's", await at("/app/", { sample: true }), { demo: false, on: true, key: "lx.sample:lx.learning.v1", db: "lexicommons-study.sample" });
check("addresses that only start like it are not it", [await at("/tryout/"), await at("/try-me/"), await at("/app/try/")].map((s) => [s.demo, s.key]), [[false, "lx.learning.v1"], [false, "lx.learning.v1"], [false, "lx.learning.v1"]]);
// Its stores cleared: by clearDemoStores on the try-out (exactly its keys and databases, a sample's left alone), and at any other page's start
// (what a try-out left goes, beside a sample's leftovers as before; the person's own keys stay).
{
  const deleted = [];
  globalThis.indexedDB = { deleteDatabase: (name) => { deleted.push(name); const r = {}; setTimeout(() => r.onsuccess?.(), 0); return r; } };
  const plant = () => {
    stored.clear();
    for (const k of ["lx.try:lx.path.v1", "lx.try:lx.streak.v1", "lx.learning.v1", "lx.sample:lx.path.v1", "lx.me.v1"]) stored.set(k, "x");
    deleted.length = 0;
  };
  plant();
  globalThis.location = new URL("https://lexicommons.test/try/");
  const onTry = await import(`${new URL("public/js/study/sample-mode.js", APP).href}?case=clear-try`);
  await onTry.clearDemoStores?.();
  check("on the try-out, clearDemoStores: its own keys and databases, nothing else", [stored.keys().sort(), [...new Set(deleted)].sort()], [["lx.learning.v1", "lx.me.v1", "lx.sample:lx.path.v1"], ["lexicommons-highlights.try", "lexicommons-plan.try", "lexicommons-practice.try", "lexicommons-study.try", "lexicommons-word-index.try"]]);
  plant();
  globalThis.location = new URL("https://lexicommons.test/app/");
  await import(`${new URL("public/js/study/sample-mode.js", APP).href}?case=clear-app`);
  await new Promise((done) => setTimeout(done, 20));
  check("the app's start: a try-out's leftovers go (a sample's too, as before); the person's own keys stay", [stored.keys().sort(), [...new Set(deleted)].filter((n) => n.endsWith(".try")).length], [["lx.learning.v1", "lx.me.v1"], 5]);
  delete globalThis.indexedDB;
}
// What reads it: error reports go out from the try-out (not from the sample learner); the first run's keys are its own.
const read = (path) => readFileSync(new URL(path, APP), "utf8");
check("error reports: held while the sample learner is on, sent from the try-out", /sampleOn\(\) && !demoPage\(\)/.test(read("public/js/lx/error-report.js")), true);
check("the first run's done and language through sampleKey", /const DONE = sampleKey\("lx\.welcome\.v1"\)/.test(read("public/js/shell/welcome.js")) && /const LEARNING = sampleKey\("lx\.learning\.v1"\)/.test(read("public/js/shell/welcome.js")), true);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
