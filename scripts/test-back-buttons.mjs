// Every way back in the app is the one floating liquid-glass back, ui.backButton. Read from public/js: the back chevron (icon "back") drawn anywhere
// but inside backButton, a button or row given it as its icon, or an app-back built by hand, fails. A line that draws the chevron
// for something that isn't a way back says so with `not a way back` on it (the chapter before, in the reader). The CSS side: the
// glass back's own rule must use the bar's glass, so the two never drift apart. Comments don't count. Usage: node
// scripts/test-back-buttons.mjs [<app dir>] (another copy of the app, to see it fail on one from before). Exit 0 = pass.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.argv[2] ? resolve(process.argv[2]) : new URL("..", import.meta.url).pathname;
const JS = join(ROOT, "public/js");
const SKIP_DIRS = new Set(["rig", "vendor", "models", "node_modules"]);
const files = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (name.endsWith(".js")) out.push(path);
  }
  return out;
};

const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);

// The one place the chevron is drawn for a way back: ui.js's backButton, from its signature to the end of its body.
const uiPath = join(JS, "lx/ui.js");
const ui = readFileSync(uiPath, "utf8");
const start = ui.indexOf("export function backButton(");
const end = start < 0 ? -1 : ui.indexOf("\n}\n", start);
if (start < 0 || end < 0) fail("public/js/lx/ui.js", "no backButton");
const insideBackButton = (path, index) => path === uiPath && index > start && index < end;

const OLD = [
  [/icon\(\s*["']back["']\s*\)/g, 'draws the back chevron itself (use ui.backButton)'],
  [/icon:\s*["']back["']/g, 'gives a button or row the back chevron as its icon (use ui.backButton)'],
  [/part:\s*["']app-back["']/g, "builds the header's back by hand (use ui.backButton({ part: \"app-back\" }))"],
];
let scanned = 0;
for (const path of files(JS)) {
  const text = readFileSync(path, "utf8");
  scanned++;
  for (const [pattern, what] of OLD) {
    for (const match of text.matchAll(pattern)) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const lineEnd = text.indexOf("\n", match.index);
      const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
      const lineNo = text.slice(0, match.index).split("\n").length;
      if (insideBackButton(path, match.index)) continue;
      if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
      // backButton({ part: "app-back", … }) is the way to build the header's back.
      if (/backButton\(\{[^}]*part:\s*["']app-back["']/.test(line)) continue;
      if (/not a way back/.test(line)) continue;
      fail(`${relative(ROOT, path)}:${lineNo}`, what);
    }
  }
}

// The CSS: one rule for the glass back, on the bar's glass.
const css = readFileSync(join(ROOT, "public/css/lx/components.css"), "utf8");
const rule = /\n\s*\.lx-back \{([^}]*)\}/.exec(css)?.[1] ?? "";
if (!rule) fail("public/css/lx/components.css", "no .lx-back rule");
for (const token of ["var(--bar-glass)", "var(--bar-filter)", "var(--bar-edge)"]) if (rule && !rule.includes(token)) fail("public/css/lx/components.css .lx-back", `doesn't use ${token}`);
// The old look's own rule must be gone: a back drawn as plain words with no glass.
if (/\[data-part="app-back"\]\s*\{/.test(css)) fail("public/css/lx/components.css", 'still has a rule of its own for [data-part="app-back"]');

// Proof the scan can fail: the patterns catch the old shapes they're meant to.
const samples = ['icon("back")', 'ui.button("Contents", { icon: "back" })', 'el("a", { part: "app-back", href })'];
for (const sample of samples) if (!OLD.some(([pattern]) => new RegExp(pattern.source).test(sample))) fail("test-back-buttons", `its patterns miss ${sample}`);

if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(`${failures.length} old-style backs (${scanned} files read)`);
  process.exit(1);
}
console.log(`PASS every way back is ui.backButton (${scanned} files read)`);
