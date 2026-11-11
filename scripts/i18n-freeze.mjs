// The freeze's refusal (../docs/plan-localization.md, outside this repo: every update localizes its new and changed words
// to every language, and a freeze refuses one that isn't). Every shipped locale, each public/i18n/<locale>.json, must
// have every English key (public/js/i18n/en/ and the language names), translated from the English as it is now (its
// `from` hash), readable, with every value its English gives, and an option for every plural category its language's own
// rules have (lx/i18n.js localeProblems: the one place these rules live). With no shipped locale it passes, and says so.
//
// Run by the freeze, never by a landing: a test-*.mjs runs before every landing, and a designer's new English string
// mustn't wait on every language's translation. Between freezes a locale shows its English for what it hasn't got.
//
//   node scripts/i18n-freeze.mjs [--dir <folder>] [--todo <file.json>] [--context <capture outDir>]
// --todo writes the work for the localize step: each key a locale lacks (missing, stale, broken or short of a plural),
// with its English, about and area, the locales that need it, and (with --context, an i18n-walk --mode capture outDir)
// whether its context has been captured: a key with none can't go to translation. --dir reads another folder of locale
// files (test-i18n.mjs plants into one). Exit 0 = every shipped locale is complete.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGES } from "../public/js/lang/index.js";
import { englishEntries, localeProblems } from "../public/js/lx/i18n.js";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const DIR = resolve(opt("--dir") ?? join(APP, "public/i18n"));
const TODO = opt("--todo") && resolve(opt("--todo"));
const CONTEXT = opt("--context") && resolve(opt("--context"));

const english = new Map(englishEntries().map((entry) => [entry.key, entry]));
const files = existsSync(DIR) ? readdirSync(DIR).filter((name) => name.endsWith(".json")).sort() : [];
let failed = 0;
const todo = new Map(); // key → Set of locales
const need = (key, locale) => {
  if (!todo.has(key)) todo.set(key, new Set());
  todo.get(key).add(locale);
};
const list = (items, n = 6) => `${items.slice(0, n).join(", ")}${items.length > n ? `, and ${items.length - n} more` : ""}`;

if (!files.length) console.log(`ok    no locale is shipped yet (${DIR} has no <locale>.json): nothing to refuse`);
for (const name of files) {
  const named = name.replace(/\.json$/, "");
  let file;
  try {
    file = JSON.parse(readFileSync(join(DIR, name), "utf8"));
  } catch (error) {
    console.log(`FAIL  ${name}: doesn't read as JSON: ${error.message}`);
    failed++;
    continue;
  }
  const found = localeProblems(file);
  const problems = [...found.errors];
  if (found.locale && found.locale !== named) problems.push(`the file is named ${name} but says it's ${found.locale}`);
  if (found.locale && !LANGUAGES[found.locale] && !LANGUAGES[found.locale.split("-")[0]]) problems.push(`${found.locale} isn't a language the app knows (public/js/lang/)`);
  if (found.missing.length) problems.push(`${found.missing.length} English keys with no entry: ${list(found.missing)}`);
  if (found.stale.length) problems.push(`${found.stale.length} translated from English that has changed since: ${list(found.stale)}`);
  if (found.broken.length) problems.push(`${found.broken.length} that don't read or don't carry the English's values: ${list(found.broken.map((b) => `${b.key} (${b.problem})`), 4)}`);
  if (found.plurals.length) problems.push(`${found.plurals.length} plurals short of a category ${found.locale} has: ${list(found.plurals.map((p) => `${p.key} (no ${p.lacks.join(", ")})`), 4)}`);
  if (found.unknown.length) problems.push(`${found.unknown.length} keys the English doesn't have (left over; remove them): ${list(found.unknown)}`);
  for (const key of [...found.missing, ...found.stale, ...found.broken.map((b) => b.key), ...found.plurals.map((p) => p.key)]) need(key, found.locale ?? named);
  if (problems.length) {
    failed++;
    console.log(`FAIL  ${name}: ${found.ok.length} of ${english.size} keys complete`);
    for (const problem of problems) console.log(`        ${problem}`);
  } else console.log(`ok    ${name}: all ${english.size} keys complete and current`);
}

if (TODO) {
  const keys = [...todo].map(([key, locales]) => {
    const entry = english.get(key);
    return { key, english: entry.text, about: entry.about ?? null, area: entry.area, locales: [...locales].sort(), context: CONTEXT ? existsSync(join(CONTEXT, "context", `${key}.json`)) : null };
  });
  writeFileSync(TODO, `${JSON.stringify({ at: new Date().toISOString(), locales: files.map((n) => n.replace(/\.json$/, "")), keys }, null, 2)}\n`);
  const blind = keys.filter((k) => k.context === false);
  console.log(`todo: ${keys.length} keys to translate into ${new Set(keys.flatMap((k) => k.locales)).size} locales, written to ${TODO}${CONTEXT ? `; ${blind.length} have no captured context yet${blind.length ? ` (${list(blind.map((k) => k.key))})` : ""}` : ""}`);
}

console.log(failed ? `\n${failed} locale(s) not ready: the freeze is refused` : "\nevery shipped locale is complete");
process.exit(failed ? 1 : 0);
