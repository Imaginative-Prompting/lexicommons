// Every check can fail where it waits: no waitForFunction with an async predicate in scripts/. Playwright takes the
// Promise an async function returns as truthy and resolves at once, whatever it would have said, so a wait like that
// checks nothing. Until 2 Nov 2026 app-check's "the device's voice spoke" could never fail this way (and push-check's
// notification stage read null). A predicate that hands back a promise without `async` is the same (`() =>
// import(…).then(…)`, `() => fetch(…)`: on 5 Nov 2026 translator-check's wait for the translator's look at the device
// waited for nothing). Poll inside page.evaluate instead. In Node: `node scripts/test-check-waits.mjs` (exit 0 = pass).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const scripts = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules" && name !== "fixtures") walk(path);
    } else if (/\.(mjs|js)$/.test(name) && path !== fileURLToPath(import.meta.url)) scripts.push(path);
  }
};
walk(HERE);
// An async predicate, or one whose body is a promise: a module imported, a fetch, Cache Storage, storage, a new Promise,
// or anything ending in .then(…).
const PROMISE_WAIT = /waitForFunction\(\s*(?:async\b|(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\{[^}]*\breturn\s+)?(?:import\(|fetch\(|caches\.|navigator\.storage\.|new Promise\b|[^,;\n]*?\.then\())/g;
const waitsIn = (text) => [...text.matchAll(PROMISE_WAIT)].map((m) => text.slice(0, m.index).split("\n").length);

// A PLANT first: each form must be caught, and a plain predicate must not be.
const PLANT = [
  "await page.waitForFunction(async () => (await fetch('/a')).ok);",
  'await page.waitForFunction(() => import("/js/x.js").then((m) => m.ready()), null, { timeout: 5000 });',
  "await page.waitForFunction(() => fetch('/a').then((r) => r.ok));",
  "await page.waitForFunction((c) => caches.open(c).then((x) => x.match('/a')), 'c');",
  "await page.waitForFunction(() => document.documentElement.dataset.theme === 'paper');",
].join("\n");
const planted = waitsIn(PLANT);
const plantOk = planted.join(",") === "1,2,3,4";
console.log(`${plantOk ? "ok  " : "FAIL"}  the plant: every promise-shaped wait caught, the plain one not (lines ${planted.join(",") || "none"})`);

const found = [];
for (const path of scripts) {
  const text = readFileSync(path, "utf8");
  for (const line of waitsIn(text)) found.push(`${relative(HERE, path)}:${line}`);
}
console.log(`${found.length ? "FAIL" : "ok  "}  no waitForFunction whose predicate is a promise (${scripts.length} scripts)${found.length ? `: ${found.join(", ")}` : ""}`);
const failed = (plantOk ? 0 : 1) + (found.length ? 1 : 0);
console.log(`${2 - failed}/2 passed`);
process.exit(failed ? 1 : 0);
