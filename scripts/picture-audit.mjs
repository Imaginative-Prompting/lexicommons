// Every word a language pictures, with every sentence that uses it, and the sentences that are new since the last audit. A word's
// picture is checked against the sentences of its day; a later lesson can use the same word in another sense ("im Sommer", "bom dia",
// "ici-bas"), and the picture would then mislead there. A word is pictured by its language's map (public/pictures/words.<lang>.json,
// read in every pack of that language) or by a lesson word's own picture field (read only in that lesson's sentences).
// The last audit is kept outside the repo (default ../docs/design/pictures/picture-audit.json): a sentence is new when its pack and id
// weren't there or its text has changed since, and a word is new when its picture line wasn't there or now names another drawing.
// Usage: node scripts/picture-audit.mjs [<app dir>] [--lang nl,es] [--record <file>] [--all] [--save]
//   prints each language's pictured words with what's new (with --all, every pictured word and all its sentences);
//   exit 1 when something is new: read each new sentence against its word's picture, then --save records this audit; exit 0 when nothing is.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const readJson = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
const fingerprint = (text) => createHash("sha1").update(text).digest("hex").slice(0, 10);

/** Each language's pictured words and their sentences, as they are now. */
export function picturedNow(appDir, languages = null) {
  const pictures = readJson(join(appDir, "public/pictures/manifest.json"))?.pictures ?? {};
  const packs = new Map();   // language -> [pack]
  for (const name of readdirSync(join(appDir, "packs")).filter((n) => n.endsWith(".json")).sort()) {
    const pack = readJson(join(appDir, "packs", name));
    if (!pack?.language || !pack.id) continue;
    if (!packs.has(pack.language)) packs.set(pack.language, []);
    packs.get(pack.language).push(pack);
  }
  const wanted = languages ?? [...packs.keys()].sort();
  const out = {};
  for (const language of wanted) {
    const words = readJson(join(appDir, `public/pictures/words.${language}.json`))?.words ?? {};
    // a sentence's words are [text], [text, lemma] or [text, lemma or null, reading] (pack-format.js); pictures are looked up by the lemma
    const lemmasOf = (item) => new Set((item.words ?? []).filter((w) => Array.isArray(w) && typeof w[1] === "string").map((w) => w[1]));
    const sentence = (pack, item) => ({ key: `${pack.id}:${item.id}`, text: item.text ?? "", means: item.means ?? "", hash: fingerprint(`${item.text ?? ""}\n${item.means ?? ""}`) });
    const byLemma = new Map();
    for (const pack of packs.get(language) ?? []) {
      for (const item of pack.items ?? []) {
        if (!item?.id) continue;
        for (const lemma of lemmasOf(item)) {
          if (!byLemma.has(lemma)) byLemma.set(lemma, []);
          byLemma.get(lemma).push(sentence(pack, item));
        }
      }
    }
    const lines = {};
    for (const [lemma, picture] of Object.entries(words)) {
      if (!Object.hasOwn(pictures, picture)) continue;   // a line to a drawing not made yet shows nothing
      lines[`map:${lemma}`] = { lemma, picture, where: "map", sentences: byLemma.get(lemma) ?? [] };
    }
    for (const pack of packs.get(language) ?? []) {
      const items = new Map((pack.items ?? []).map((item) => [item.id, item]));
      for (const lesson of pack.lessons ?? []) {
        for (const word of lesson.words ?? []) {
          if (!word.picture || !Object.hasOwn(pictures, word.picture)) continue;
          const own = (lesson.items ?? []).map((id) => items.get(id)).filter((item) => item && lemmasOf(item).has(word.lemma));
          lines[`field:${pack.id}/${lesson.id}/${word.lemma}`] = { lemma: word.lemma, picture: word.picture, where: `${pack.id} ${lesson.id}`, sentences: own.map((item) => sentence(pack, item)) };
        }
      }
    }
    out[language] = lines;
  }
  return out;
}

/** What's new against a recorded audit: per language, the lines that are new or changed and the sentences new or changed. */
export function newSince(now, record) {
  const found = {};
  for (const [language, lines] of Object.entries(now)) {
    const before = record?.[language] ?? {};
    for (const [key, line] of Object.entries(lines)) {
      const was = before[key];
      const lineIsNew = !was || was.picture !== line.picture;
      const fresh = line.sentences.filter((s) => lineIsNew || was.sentences?.[s.key] !== s.hash);
      if (lineIsNew || fresh.length) (found[language] ??= []).push({ key, ...line, lineIsNew, fresh });
    }
  }
  return found;
}

/** The record for these languages, as they are now (other languages' records kept as they were). */
export function recordOf(now, record = {}) {
  const next = { ...record };
  for (const [language, lines] of Object.entries(now)) {
    next[language] = Object.fromEntries(Object.entries(lines).map(([key, line]) =>
      [key, { picture: line.picture, sentences: Object.fromEntries(line.sentences.map((s) => [s.key, s.hash])) }]));
  }
  return next;
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const flag = (name) => { const i = args.indexOf(`--${name}`); if (i >= 0) args.splice(i, 1); return i >= 0; };
  const langs = option("lang"); const recordOpt = option("record"); const all = flag("all"); const save = flag("save");
  const appDir = resolve(args[0] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const recordFile = resolve(recordOpt ?? join(appDir, "..", "docs", "design", "pictures", "picture-audit.json"));
  const record = existsSync(recordFile) ? readJson(recordFile) ?? {} : {};
  const now = picturedNow(appDir, langs ? langs.split(",") : null);
  const found = newSince(now, record);
  let newCount = 0;
  for (const [language, lines] of Object.entries(now)) {
    const fresh = found[language] ?? [];
    const sentences = Object.values(lines).reduce((n, l) => n + l.sentences.length, 0);
    console.log(`== ${language}: ${Object.keys(lines).length} pictured words, ${sentences} sentences; new since the last audit: ${fresh.length} words`);
    const show = all ? Object.entries(lines).map(([key, line]) => fresh.find((f) => f.key === key) ?? { key, ...line, lineIsNew: false, fresh: [] }) : fresh;
    for (const line of show) {
      const freshKeys = new Set(line.fresh.map((s) => s.key));
      console.log(`${line.lemma} -> ${line.picture} (${line.where})${line.lineIsNew ? "  NEW PICTURE LINE" : ""}`);
      for (const s of all ? line.sentences : line.fresh) {
        console.log(`   ${freshKeys.has(s.key) ? "NEW " : "    "}${s.key}  ${s.text}  /  ${s.means}`);
      }
      newCount += line.fresh.length + (line.lineIsNew && !line.fresh.length ? 1 : 0);
    }
  }
  if (save) {
    mkdirSync(dirname(recordFile), { recursive: true });
    writeFileSync(recordFile, JSON.stringify(recordOf(now, record)) + "\n");
    console.log(`recorded this audit in ${recordFile}`);
    return;
  }
  console.log(newCount ? `${newCount} new: read each against its word's picture, then --save to record this audit` : "nothing new since the last audit");
  // exitCode, never process.exit(): on a pipe (| tail) exit drops whatever output hasn't been written yet
  process.exitCode = newCount ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
