// Every part the app builds is on the theming surface (public/js/lx/parts.js PARTS), read from the code, not from a page: a part built
// only on a screen /design doesn't draw was never seen by /design's own check (design-check's "on the page but not listed"), and
// reader-turn-button went out unlisted that way (v675, 11 Nov 2026). With this, every part the code builds is listed, and design-check
// holds every listed part to /design, so a new part comes with its row in parts.js and its demo on /design in the same landing.
// Read from public/js (the rig's own motion parts aside) and public's HTML: el()'s `part: "…"`, `"data-part": "…"` (a condition's first
// name too), `dataset.part = "…"`, `setAttribute("data-part", "…")`, markup's `data-part="…"`, and an options default (`{ part = "…" }`);
// comments don't count. The CSS: a part a stylesheet styles is listed or built (else it's a rule that matches nothing).
// OWED and OWED_DEAD are what was missing when this test came (11 Nov 2026): each lane lists and shows its own, or takes its dead rules out,
// after the desktop work. They only shrink: one listed now, no longer built or no longer styled fails until it comes off the list.
// Usage: node scripts/test-parts-listed.mjs [<app dir>] (another copy of the app, to see it fail on one from before). Exit 0 = pass.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.argv[2] ? resolve(process.argv[2]) : new URL("..", import.meta.url).pathname;
const started = performance.now();

// Built and never listed, with the lane that lists and shows each (frame.md's after-launch lists).
const OWED = {
  "mini-tile": "desk-know", "week-glasses": "desk-know", "week-tinta": "desk-know", "hundreds-strip": "desk-know", "common-page": "desk-know",
  hundred: "desk-know", "hundred-head": "desk-know", "idea-card": "desk-know", "word-pile": "desk-know", "word-tile": "desk-know", "word-shelf": "desk-know",
  "concept-practice": "desk-study", "game-toggle": "desk-study", "game-toggles": "desk-study", "learn-more": "desk-study", "learn-sheet": "desk-study",
  "word-picture": "desk-study", "other-gender": "desk-study", "session-idea": "desk-study", "step-tags": "desk-study", reword: "desk-study",
  "streak-calendar": "desk-read", "streak-month": "desk-read", "streak-month-days": "desk-read", "streak-day": "desk-read", "reminder-step": "desk-read",
  "ai-practice": "desk-read", "reader-parallel": "desk-read", "reader-offer": "desk-read",
};
// Styled and never built or listed: rules that match nothing, to take out.
const OWED_DEAD = { "word-field": "desk-know", "word-chip": "desk-know", "word-map": "desk-know", "map-word": "desk-know", "week-bars": "desk-know", "idea-tile": "desk-know" };

const SKIP_DIRS = new Set(["rig", "vendor", "models", "node_modules"]);
const files = (dir, ext, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, ext, out);
    else if (name.endsWith(ext)) out.push(path);
  }
  return out;
};

const NAME = String.raw`([a-z][a-z0-9-]*)`;
const BUILDS = [
  new RegExp(String.raw`\bpart:\s*"${NAME}"`, "g"),
  new RegExp(String.raw`"data-part":\s*(?:[^,}\n]*?\?\s*)?"${NAME}"`, "g"),
  new RegExp(String.raw`\.dataset\.part\s*=\s*"${NAME}"`, "g"),
  new RegExp(String.raw`setAttribute\(\s*"data-part"\s*,\s*"${NAME}"\s*\)`, "g"),
  new RegExp(String.raw`<[a-z][\w-]*\b[^<>]*\sdata-part="${NAME}"`, "g"),
  new RegExp(String.raw`\{[^{}]*\bpart\s*=\s*"${NAME}"`, "g"),
];
const STYLES = new RegExp(String.raw`\[data-part=["']?${NAME}["']?\]`, "g");
// A match on a comment's line, or after a line's // , isn't the code's.
const inComment = (text, index) => {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const before = text.slice(lineStart, index);
  return /^\s*(\/\/|\*|\/\*)/.test(before) || /(^|\s)\/\/\s/.test(before);
};
/** The parts a text builds: name → true. */
function builtIn(text) {
  const out = new Set();
  for (const re of BUILDS) for (const m of text.matchAll(re)) if (!inComment(text, m.index + m[0].length - m[1].length - 1)) out.add(m[1]);
  return out;
}
function styledIn(text) {
  const out = new Set();
  for (const m of text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(STYLES)) out.add(m[1]);
  return out;
}
/** What's wrong, given what's built, styled, listed and owed. */
function judge({ built, styled, listed, owed, owedDead }) {
  const out = [];
  for (const [name, where] of built) if (!listed.has(name) && !Object.hasOwn(owed, name)) out.push(`"${name}" is built (${[...where].join(", ")}) and not in parts.js: list it with its demo on /design in the same landing`);
  for (const name of Object.keys(owed)) {
    if (listed.has(name)) out.push(`"${name}" is listed now: take it off OWED`);
    else if (!built.has(name)) out.push(`"${name}" is no longer built: take it off OWED`);
  }
  for (const [name, where] of styled) if (!listed.has(name) && !built.has(name) && !Object.hasOwn(owedDead, name)) out.push(`"${name}" is styled (${[...where].join(", ")}) and neither built nor listed: a rule that matches nothing`);
  for (const name of Object.keys(owedDead)) {
    if (!styled.has(name)) out.push(`"${name}" isn't styled any more: take it off OWED_DEAD`);
    else if (built.has(name) || listed.has(name)) out.push(`"${name}" is built or listed now: take it off OWED_DEAD`);
  }
  return out;
}

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  ok ? passed++ : failed++;
};

// Planted first: each way of building a part found, a comment's never; each rule of the judge both ways.
const plantJs = [
  'el("div", { part: "plant-a" });',
  'el("p", { class: "x", "data-part": ready ? "plant-b" : undefined });',
  'node.dataset.part = "plant-c";',
  'span.setAttribute("data-part", "plant-d");',
  'return `<button data-part="plant-e" type="button">`;',
  'export function thing(item, { part = "plant-f", hidden } = {}) {}',
  '// el("div", { part: "plant-g" })',
  ' * part: "plant-h" in a doc comment',
  'const u = "https://x.test/a"; // part: "plant-i"',
  'document.querySelector(\'[data-part="plant-j"]\');',
].join("\n");
const plantFound = builtIn(plantJs);
check("planted: each way of building a part is read", ["plant-a", "plant-b", "plant-c", "plant-d", "plant-e", "plant-f"].every((n) => plantFound.has(n)), [...plantFound].join(", "));
check("planted: comments and a selector build nothing", ["plant-g", "plant-h", "plant-i", "plant-j"].every((n) => !plantFound.has(n)), [...plantFound].join(", "));
check("planted: a stylesheet's parts are read, a commented rule's not", (() => {
  const s = styledIn('[data-part="plant-k"] { color: red; } /* [data-part="plant-l"] */ :is([data-part=\'plant-m\']) {}');
  return s.has("plant-k") && s.has("plant-m") && !s.has("plant-l");
})());
const at = (names) => new Map(names.map((n) => [n, new Set(["planted.js"])]));
check("planted: a built part not listed fails; listed, it passes", judge({ built: at(["p1", "p2"]), styled: new Map(), listed: new Set(["p1"]), owed: {}, owedDead: {} }).length === 1 && judge({ built: at(["p1", "p2"]), styled: new Map(), listed: new Set(["p1", "p2"]), owed: {}, owedDead: {} }).length === 0);
check("planted: an owed part passes until it's listed or no longer built", judge({ built: at(["p1"]), styled: new Map(), listed: new Set(), owed: { p1: "x" }, owedDead: {} }).length === 0 && judge({ built: at(["p1"]), styled: new Map(), listed: new Set(["p1"]), owed: { p1: "x" }, owedDead: {} }).length === 1 && judge({ built: at([]), styled: new Map(), listed: new Set(), owed: { p1: "x" }, owedDead: {} }).length === 1);
check("planted: a styled part nothing builds or lists fails, unless owed dead, until it's gone", judge({ built: new Map(), styled: at(["d1"]), listed: new Set(), owed: {}, owedDead: {} }).length === 1 && judge({ built: new Map(), styled: at(["d1"]), listed: new Set(), owed: {}, owedDead: { d1: "x" } }).length === 0 && judge({ built: new Map(), styled: new Map(), listed: new Set(), owed: {}, owedDead: { d1: "x" } }).length === 1);

// The app.
const { PARTS } = await import(pathToFileURL(join(ROOT, "public/js/lx/parts.js")).href);
const listed = new Set(PARTS.map((p) => p.name));
const built = new Map();
const styled = new Map();
const note = (map, name, path) => (map.get(name) ?? map.set(name, new Set()).get(name)).add(relative(ROOT, path));
const sources = [...files(join(ROOT, "public/js"), ".js"), ...files(join(ROOT, "public"), ".html")];
for (const path of sources) for (const name of builtIn(readFileSync(path, "utf8"))) note(built, name, path);
const sheets = files(join(ROOT, "public/css"), ".css");
for (const path of sheets) for (const name of styledIn(readFileSync(path, "utf8"))) note(styled, name, path);
check("the app's files are here", sources.length > 300 && sheets.length > 10 && listed.size > 200, `${sources.length} scripts and pages, ${sheets.length} stylesheets, ${listed.size} parts listed`);
const wrong = judge({ built, styled, listed, owed: OWED, owedDead: OWED_DEAD });
check(
  "every part built is in parts.js (or owed), and every part styled is built or listed (or owed dead)",
  wrong.length === 0,
  wrong.length ? `\n      ${wrong.join("\n      ")}` : `${built.size} built, ${styled.size} styled, ${Object.keys(OWED).length} owed, ${Object.keys(OWED_DEAD).length} dead rules owed`,
);
console.log(`\n${passed}/${passed + failed} passed in ${Math.round(performance.now() - started)} ms`);
process.exit(failed ? 1 : 0);
