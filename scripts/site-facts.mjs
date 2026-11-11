#!/usr/bin/env node
// The home page's numbers (public/js/site-facts.js) into its words (public/index.html): each piece whose catalog English
// (public/js/i18n/en/site.js) takes a value is written again from the facts, in English. Set the facts at a release, then run this;
// scripts/test-site-pages.mjs fails while the page and the facts disagree.
//   node scripts/site-facts.mjs             write the page's words from the facts (says what changed)
//   node scripts/site-facts.mjs --check     change nothing; exit 1 if the page doesn't say what the facts do
//   node scripts/site-facts.mjs --compare   the facts beside this repo's own counts (packs/, public/pictures/, public/js/study/reactions/)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(APP, "public/index.html");
const { SITE_FACTS, siteValues } = await import(pathToFileURL(join(APP, "public/js/site-facts.js")).href);
const catalog = (await import(pathToFileURL(join(APP, "public/js/i18n/en/site.js")).href)).default;
const { formatMessage } = await import(pathToFileURL(join(APP, "public/js/lx/i18n.js")).href);

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** The keys whose English takes a value, each with its words in English from the facts. */
export function factWords(english = catalog, values = siteValues(SITE_FACTS)) {
  const out = new Map();
  for (const [key, [text]] of Object.entries(english)) if (text.includes("{")) out.set(key, formatMessage(text, values, key, "en"));
  return out;
}
/** The page with each such piece's text written from the facts, and the keys that changed. */
export function written(html, words = factWords()) {
  const changed = [];
  const out = html.replace(/(<([a-z][a-z0-9]*)\b[^>]*\sdata-t="([^"]+)"[^>]*>)([^<]*)(?=<)/g, (all, open, tag, key, text) => {
    if (!words.has(key)) return all;
    const now = escape(words.get(key));
    if (now !== text) changed.push(`${key}: “${text}” → “${now}”`);
    return open + now;
  });
  return { html: out, changed };
}

const argv = process.argv.slice(2);
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (argv.includes("--compare")) {
    const langs = new Set();
    const lessons = {};
    for (const file of readdirSync(join(APP, "packs")).filter((f) => f.endsWith(".json"))) {
      const pack = JSON.parse(readFileSync(join(APP, "packs", file), "utf8"));
      langs.add(pack.language);
      if (file.startsWith("path-")) lessons[pack.language] = (pack.lessons ?? []).length;
    }
    const manifest = JSON.parse(readFileSync(join(APP, "public/pictures/manifest.json"), "utf8"));
    const pictures = Array.isArray(manifest.pictures) ? manifest.pictures.length : Object.keys(manifest.pictures).length;
    const stories = readdirSync(join(APP, "public/js/study/reactions")).filter((f) => f.endsWith(".js")).length;
    console.log(`languages  facts ${SITE_FACTS.languages}   this repo's packs: ${langs.size} languages`);
    for (const code of new Set([...Object.keys(SITE_FACTS.lessons), ...Object.keys(lessons)])) {
      console.log(`lessons ${code}  facts ${SITE_FACTS.lessons[code] ?? "—"}   this repo's path-${code}: ${lessons[code] ?? "none"}`);
    }
    console.log(`pictures   facts over ${SITE_FACTS.pictures}   this repo's manifest: ${pictures}`);
    console.log(`moving     facts about ${SITE_FACTS.moving}   this repo's reaction files: ${stories} (a few may be shared helpers)`);
    console.log("(the library a release serves can be ahead of this repo's packs; the facts are what's true for the release)");
    process.exit(0);
  }
  const { html, changed } = written(readFileSync(PAGE, "utf8"));
  if (argv.includes("--check")) {
    console.log(changed.length ? `the page and the facts disagree:\n  ${changed.join("\n  ")}` : "the page says what the facts do");
    process.exit(changed.length ? 1 : 0);
  }
  if (changed.length) writeFileSync(PAGE, html);
  console.log(changed.length ? `wrote ${changed.length}:\n  ${changed.join("\n  ")}` : "nothing to change: the page says what the facts do");
}
