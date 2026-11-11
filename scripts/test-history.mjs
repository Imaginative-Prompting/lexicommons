// The browser's history has one owner, the router (shell/main.js, "back: one rule"): every back, the app's and the phone's own, steps through
// it, so it holds only what a back should reach, and each entry carries its place (history.state.lx.i). A page that writes the history itself
// breaks that: one that replaced its address with a state of null (Explore's requests, Settings' redirects, until 5 Nov 2026) left an entry the
// router took for a new one when a back reached it, and its record of the history ran ahead of the browser's. So no file under public/ but the
// router pushes, goes back or forward, or replaces an address without keeping history.state; the pages outside the app (a callback that runs
// before it) are the only others. Each rule refuses a plant first.
// Usage: node scripts/test-history.mjs [<app dir>]   (exit 0 = pass)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const APP = resolve(process.argv[2] ?? new URL("..", import.meta.url).pathname);
const PUBLIC = join(APP, "public");
const ROUTER = "js/shell/main.js";
// Pages of their own, outside the app: the two callbacks before it, and the edge swipe test (public/edge-test/, temporary), which puts entries
// in its own page's history on purpose to see what an iPhone's edge swipe does with them.
const OUTSIDE = new Set(["js/storage-callback.js", "js/ai/own-key-callback.js", "edge-test/run.js"]);
let failed = 0;
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!["vendor", "models", "node_modules"].includes(name)) walk(path);
    } else if (name.endsWith(".js") || name.endsWith(".mjs")) files.push(path);
  }
};
walk(PUBLIC);
// What a file does to the history, line by line (comments aside).
function problems(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/history\.(pushState|back|forward|go)\s*\(/.test(code)) out.push(`line ${i + 1}: ${code.trim().slice(0, 90)}`);
    const replace = code.match(/history\.replaceState\(\s*([^,]+),/);
    if (replace && !/history\.state/.test(replace[1])) out.push(`line ${i + 1}: an address replaced without the entry's place: ${code.trim().slice(0, 90)}`);
  });
  return out;
}
// The rule refuses its plants first.
const plants = [
  ['history.replaceState(null, "", "#settings/appearance");', 1],
  ["history.back();", 1],
  ["history.go(-1);", 1],
  ['history.pushState({}, "", "#x");', 1],
  ['history.replaceState(history.state, "", "#explore/requests");', 0],
  ['history.replaceState({ ...(history.state ?? {}), lx: { i: 0 } }, "");', 0],
  ["// history.back() in a comment", 0],
];
const missed = plants.filter(([code, n]) => problems(code).length !== n);
report(missed.length === 0, "the rule catches each planted write and passes each kept place", missed.map(([c]) => c).join(" | "));
const bad = [];
for (const path of files) {
  const rel = relative(PUBLIC, path);
  if (rel === ROUTER || OUTSIDE.has(rel)) continue;
  for (const p of problems(readFileSync(path, "utf8"))) bad.push(`${rel} ${p}`);
}
report(bad.length === 0, `no page but the router writes the history (${files.length} files)`, bad.join("; "));
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
