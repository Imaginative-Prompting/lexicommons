// Moving an area's words into t() (lx/i18n.js), the mechanical part: every string literal that reads like words a person
// sees (i18n-literals.mjs) becomes a key in the area's English catalog (public/js/i18n/en/<area>.js) and a t() call, a
// template's ${…} a named {value}. What can't be moved by rule is left and listed for a person: a literal used as an object
// key, a case, a comparison or a lookup, a log line, an error thrown. Glued pieces and counts need a person too: the plan
// says where, and overrides say what (a message, its values, its about, or the exact code that replaces the literal).
//
//   node scripts/i18n-move.mjs plan <area> <file…> --out <plan.json> [--label "Home"]
//   node scripts/i18n-move.mjs apply <plan.json> [--overrides <overrides.json>]
// Run in the app copy being changed. apply edits the files, writes the area's catalog (merging into one already there),
// registers it in js/i18n/en/index.js, public/sw.js SHELL and scripts/fixtures/i18n-areas.json, and refuses if a file has
// changed since its plan. Then: test-i18n.mjs (nothing left outside t()), and i18n-walk.mjs's text, pseudo and capture.
//
// overrides.json: { "<id>": { "skip": "why" } | { "key"?, "message"?, "vars"?: { name: "js expression" }, "about"? } |
// { "code": "the exact code in the literal's place", "key", "message", "about" } }, an id being "<file>:<line>:<n>";
// "_entries": { key: [English, about] } for keys a person writes by hand, "_imports": names besides t to import from lx/i18n.js.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { literalsOf, uiLike } from "./i18n-literals.mjs";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const [mode, ...rest] = process.argv.slice(2);
const opt = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const positional = rest.filter((arg, i) => !arg.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));
const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const ROLES = {
  kicker: "the small line above a card's title",
  title: "a title (a card's, a row's or a page's)",
  meta: "the line under a card's title",
  label: "a button's or a link's words",
  sub: "a row's second line",
  text: "a link's or a line's words",
  note: "a short note under a control",
  "aria-label": "what a screen reader reads for it (not shown)",
  placeholder: "a field's placeholder, shown until something's typed",
  alt: "a picture's description, read by screen readers",
  words: "the words beside the character",
  empty: "the words of an empty state",
};
const CALLS = {
  button: "a button's words",
  listRow: "a row in a list",
  emptyState: "the words of an empty state, beside the character",
  sectionHead: "a section's heading",
  toast: "a short message that comes and goes",
  feedback: "the line shown after an answer",
  retryLine: "a line saying something didn't work, beside a Retry button",
  loadingState: "the words while something loads",
  lookingUp: "the words while the app looks something up",
  iconButton: "what a screen reader reads for an icon button",
  segmented: "an option of a segmented control (a row of choices)",
  badge: "a small badge",
  conceptTag: "a small chip",
};
const ELEMENTS = { h1: "the page's title", h2: "a section's heading", h3: "a small heading", p: "a line of text", li: "an item in a list", span: "words inside a line", strong: "words in bold", label: "a field's label", summary: "the line that opens a section" };

// What's around a literal: the property it's the value of, the call it's an argument to, the element it's put in, the function it's in.
function contextOf(source, at) {
  const before = source.slice(Math.max(0, at - 220), at);
  const property = /(?:^|[{,\s(])"?([\w-]+)"?\s*:\s*(?:[^,{}():]*\?\s*)?$/.exec(before)?.[1];
  const call = /(?:ui\.)?(\w+)\(\s*(?:[^()]*,\s*)?$/.exec(before)?.[1];
  const element = /el\(\s*"(\w+)"[^()]*$/.exec(before)?.[1];
  const head = source.slice(0, at);
  const fns = [...head.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>)/g)];
  const fn = fns.length ? fns.at(-1)[1] ?? fns.at(-1)[2] : null;
  return { property, call, element, fn };
}

// Why a literal can't be moved by rule, or null.
function blocker(source, literal) {
  const before = source.slice(Math.max(0, literal.start - 60), literal.start).trimEnd();
  const after = source.slice(literal.end, literal.end + 40).trimStart();
  if (/\bcase$/.test(before)) return "a case label";
  if (/[{,]$/.test(before) && after.startsWith(":")) return "an object key";
  if (/(===|!==|==|!=)$/.test(before) || /^(===|!==|==|!=)/.test(after)) return "a comparison";
  if (/\.(includes|startsWith|endsWith|indexOf|has|get|test|match|replace|split)\($/.test(before)) return "a lookup";
  if (/console\.\w+\($/.test(before)) return "a log line";
  if (/(new\s+\w*Error\(|throw\s*)$/.test(before)) return "an error thrown (shown to a person? then move it by hand)";
  return null;
}

const camel = (text) => {
  const words = text.replace(/\{\}/g, " ").replace(/['’]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const out = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("");
  return out.slice(0, 40) || "text";
};
// A value's name from its expression: x → x, a.b?.c → c, name() → name, getName() → name; else value<n>.
const nameOf = (expr, n) => {
  const s = expr.trim();
  let m = /^([A-Za-z_$][\w$]*)$/.exec(s) ?? /([A-Za-z_$][\w$]*)\s*$/.exec(s.replace(/\?\./g, ".")) ?? null;
  if (/^[A-Za-z_$][\w$.?]*\(\)$/.test(s)) m = /([A-Za-z_$][\w$]*)\(\)$/.exec(s);
  let name = m ? m[1].replace(/^get([A-Z])/, (_, c) => c.toLowerCase()) : `value${n}`;
  if (!/^[A-Za-z_][\w-]*$/.test(name) || /^(length|n|i|x)$/.test(name)) name = name === "n" ? "count" : `value${n}`;
  return name;
};

if (mode === "plan") {
  const [area, ...files] = positional;
  const out = resolve(opt("--out") ?? `${area}-plan.json`);
  const label = opt("--label") ?? area;
  const { englishEntries } = await import(pathToFileURL(join(APP, "public/js/lx/i18n.js")).href);
  const taken = new Set(englishEntries().map((e) => e.key));
  const byText = new Map(); // text + role → key, so the same words in the same role share a key
  const items = [];
  const left = [];
  for (const file of files) {
    const source = readFileSync(join(APP, file), "utf8");
    let nth = 0;
    let lastLine = 0;
    for (const literal of literalsOf(source)) {
      if (!uiLike(literal)) continue;
      nth = literal.line === lastLine ? nth + 1 : 0;
      lastLine = literal.line;
      const id = `${file}:${literal.line}:${nth}`;
      const code = source.split("\n")[literal.line - 1].trim();
      const why = blocker(source, literal);
      if (why) {
        left.push({ id, text: literal.text, why, code });
        continue;
      }
      const ctx = contextOf(source, literal.start);
      const role = ROLES[ctx.property] ?? CALLS[ctx.call] ?? ELEMENTS[ctx.element] ?? "words on the screen";
      const names = [];
      const vars = {};
      literal.exprs.forEach((expr, n) => {
        let name = nameOf(expr.source, n + 1);
        while (names.includes(name)) name = `${name}${n + 1}`;
        names.push(name);
        vars[name] = expr.source;
      });
      let i = 0;
      const message = literal.template ? literal.text.replace(/\{\}/g, () => `{${names[i++]}}`) : literal.text;
      if (/[{}]/.test(literal.template ? literal.text.replace(/\{\}/g, "") : literal.text)) left.push({ id, text: literal.text, why: "a brace in its words (ICU needs it quoted)", code });
      const reuse = byText.get(`${message}|${role}`);
      let key = reuse;
      if (!key) {
        const base = `${area}.${camel(literal.text)}`;
        key = base;
        for (let k = 2; taken.has(key); k++) key = `${base}${k}`;
        taken.add(key);
        byText.set(`${message}|${role}`, key);
      }
      const about = `${label} (${file.replace(/^public\/js\//, "")}${ctx.fn ? `, ${ctx.fn}` : ""}): ${role}.${literal.exprs.length ? ` ${names.map((n, k) => `{${n}}: ${literal.exprs[k].source}`).join("; ")}.` : ""}`;
      items.push({ id, file, line: literal.line, start: literal.start, end: literal.end, text: literal.text, template: literal.template, key, message, vars, about, code, reused: Boolean(reuse) });
    }
  }
  const fileHashes = Object.fromEntries(files.map((file) => [file, sha(readFileSync(join(APP, file), "utf8"))]));
  writeFileSync(out, `${JSON.stringify({ area, label, files: fileHashes, items, left }, null, 1)}\n`);
  console.log(`plan ${area}: ${items.length} to move (${items.filter((i) => i.template).length} templates, ${items.filter((i) => i.reused).length} sharing a key), ${left.length} left for a person; ${out}`);
  for (const l of left) console.log(`  left ${l.id}: ${l.why}: ${JSON.stringify(l.text)}`);
}

if (mode === "apply") {
  const plan = JSON.parse(readFileSync(resolve(positional[0]), "utf8"));
  const overrides = opt("--overrides") ? JSON.parse(readFileSync(resolve(opt("--overrides")), "utf8")) : {};
  for (const [file, hash] of Object.entries(plan.files)) if (sha(readFileSync(join(APP, file), "utf8")) !== hash) throw new Error(`${file} has changed since its plan: plan it again`);
  for (const id of Object.keys(overrides)) if (!id.startsWith("_") && !plan.items.some((i) => i.id === id) && !plan.left.some((l) => l.id === id)) throw new Error(`an override for ${id}, which the plan doesn't have`);
  const entries = { ...(overrides._entries ?? {}) };
  const names = ["t", ...(overrides._imports ?? [])];
  const byFile = new Map();
  for (const item of plan.items) {
    const o = overrides[item.id] ?? {};
    if (o.skip) continue;
    const key = o.key ?? item.key;
    const message = o.message ?? item.message;
    const vars = o.vars ?? item.vars;
    const about = o.about ?? item.about;
    if (entries[key] && entries[key][0] !== message) throw new Error(`${key} given two messages: ${JSON.stringify(entries[key][0])} and ${JSON.stringify(message)}`);
    entries[key] = [message, about];
    const pairs = Object.entries(vars).map(([name, expr]) => (name === expr.trim() ? name : `${/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)}: ${expr.trim()}`));
    const code = o.code ?? (pairs.length ? `t(${JSON.stringify(key)}, { ${pairs.join(", ")} })` : `t(${JSON.stringify(key)})`);
    if (!byFile.has(item.file)) byFile.set(item.file, []);
    byFile.get(item.file).push({ start: item.start, end: item.end, code });
  }
  // Literals left for a person but given code in the overrides.
  for (const l of plan.left) {
    const o = overrides[l.id];
    if (!o?.code) continue;
    const item = l;
    const source = readFileSync(join(APP, l.id.split(":")[0]), "utf8");
    const found = literalsOf(source).filter((x) => x.line === Number(l.id.split(":")[1]) && x.text === l.text);
    if (found.length !== 1) throw new Error(`${l.id}: can't place its override`);
    if (o.key) entries[o.key] = [o.message, o.about];
    const file = l.id.split(":")[0];
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push({ start: found[0].start, end: found[0].end, code: o.code });
    void item;
  }
  for (const [file, edits] of byFile) {
    let source = readFileSync(join(APP, file), "utf8");
    for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.code + source.slice(edit.end);
    if (!/import\s*\{[^}]*\}\s*from\s*"[^"]*lx\/i18n\.js"/.test(source)) {
      const rel = relative(dirname(join(APP, file)), join(APP, "public/js/lx/i18n.js")).replace(/\\/g, "/");
      const imports = [...source.matchAll(/^import [^;]+;\n/gm)];
      const at = imports.length ? imports.at(-1).index + imports.at(-1)[0].length : 0;
      const used = names.filter((name) => name === "t" || new RegExp(`\\b${name}\\(`).test(source));
      source = `${source.slice(0, at)}import { ${used.sort().join(", ")} } from "${rel.startsWith(".") ? rel : `./${rel}`}";\n${source.slice(at)}`;
    }
    writeFileSync(join(APP, file), source);
  }
  // The area's catalog (merged into one already there), its place in index.js, SHELL and the areas list.
  const catalogPath = join(APP, "public/js/i18n/en", `${plan.area}.js`);
  const existing = existsSync(catalogPath) ? (await import(pathToFileURL(catalogPath).href + `?${Date.now()}`)).default : {};
  const all = { ...existing, ...entries };
  const body = Object.entries(all).map(([key, [text, about]]) => `  ${JSON.stringify(key)}: [${JSON.stringify(text)}, ${JSON.stringify(about)}],`).join("\n");
  writeFileSync(catalogPath, `// ${plan.label}'s words (${Object.keys(plan.files).join(", ")}). Each entry is [English, about] (lx/i18n.js has the format);\n// about says what it is, where it shows and how much room it has, for whoever translates it.\n\nexport default {\n${body}\n};\n`);
  const indexPath = join(APP, "public/js/i18n/en/index.js");
  let index = readFileSync(indexPath, "utf8");
  if (!index.includes(`from "./${plan.area}.js"`)) {
    const ident = plan.area.replace(/-(\w)/g, (_, c) => c.toUpperCase());
    index = index.replace(/(import \w+ from "\.\/[\w-]+\.js";\n)(?![\s\S]*import \w+ from)/, `$1import ${ident} from "./${plan.area}.js";\n`);
    index = index.replace(/export const AREAS = \{ ([^}]*) \};/, (_, list) => `export const AREAS = { ${list}, ${ident} };`);
    writeFileSync(indexPath, index);
  }
  const swPath = join(APP, "public/sw.js");
  let sw = readFileSync(swPath, "utf8");
  const shellLine = `  "/js/i18n/en/${plan.area}.js",\n`;
  if (!sw.includes(`"/js/i18n/en/${plan.area}.js"`)) {
    sw = sw.replace(/(  "\/js\/i18n\/en\/[\w-]+\.js",\n)(?![\s\S]*"\/js\/i18n\/en\/)/, `$1${shellLine}`);
    writeFileSync(swPath, sw);
  }
  const areasPath = join(APP, "scripts/fixtures/i18n-areas.json");
  const areas = JSON.parse(readFileSync(areasPath, "utf8"));
  const spec = areas.areas[plan.area] ?? { catalog: `public/js/i18n/en/${plan.area}.js`, files: [], allow: {}, complete: false, states: [] };
  spec.files = [...new Set([...spec.files, ...Object.keys(plan.files)])];
  areas.areas[plan.area] = spec;
  writeFileSync(areasPath, `${JSON.stringify(areas, null, 2)}\n`);
  console.log(`apply ${plan.area}: ${Object.keys(entries).length} keys into ${relative(APP, catalogPath)} (${Object.keys(all).length} in all), ${[...byFile].map(([f, e]) => `${f} ${e.length}`).join(", ")}`);
}
