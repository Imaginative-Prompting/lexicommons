#!/usr/bin/env node
// The public home page's words (public/index.html) against its catalog (public/js/i18n/en/site.js): the page is written in English for
// search engines and the first paint, and public/js/site.js puts a shipped locale's words in by each piece's key. So every piece of text
// on it carries its key (data-t, data-t-alt for an image's description, data-t-label for what a screen reader says for a video or a
// button, data-t-content for a meta's), says exactly its key's English (a number in it as public/js/site-facts.js has it: written by
// scripts/site-facts.mjs), and every key of the catalog is on the page; only the name Lexicommons stands as it is. Each rule refuses a
// planted page.
// Usage: node scripts/test-site-pages.mjs (exit 0 = pass)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = (await import(pathToFileURL(join(APP, "public/js/i18n/en/site.js")).href)).default;
const page = readFileSync(join(APP, "public/index.html"), "utf8");
const { SITE_FACTS, siteValues } = await import(pathToFileURL(join(APP, "public/js/site-facts.js")).href);
const { factWords } = await import(pathToFileURL(join(APP, "scripts/site-facts.mjs")).href);
// Words that stand as they are in every language: the app's name.
const AS_IS = new Set(["Lexicommons"]);

const decode = (text) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t\n\r]+/g, " ").replace(/^ | $/g, "");
const attr = (attrs, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs);
  return m ? decode(m[1]) : null;
};

function problems(html, english, words = factWords(english, siteValues(SITE_FACTS))) {
  const out = [];
  const says = (key) => words.get(key) ?? english[key][0];
  const used = new Set();
  const body = html.slice(html.indexOf("<body"));
  // Text right inside an element: it has a key, and says that key's English; else it's the name, standing as it is.
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)([^>]*)>([^<]*)(?=<)/g)) {
    const [, tag, attrs, raw] = m;
    const text = decode(raw);
    if (!text || tag === "script" || tag === "style") continue;
    const key = attr(attrs, "data-t");
    if (!key) {
      if (body.includes(m[0]) && !AS_IS.has(text)) out.push(`text with no key: “${text}”`);
      continue;
    }
    used.add(key);
    if (!(key in english)) out.push(`${key}: not in the catalog`);
    else if (says(key) !== text) out.push(`${key}: the page says “${text}”, the catalog “${says(key)}”`);
  }
  // An image's description and a meta's content, by their keys.
  for (const [name, keyAttr] of [["alt", "data-t-alt"], ["content", "data-t-content"]]) {
    for (const m of html.matchAll(/<(img|meta)\b([^>]*)>/g)) {
      const attrs = m[2];
      const value = attr(attrs, name);
      const key = attr(attrs, keyAttr);
      if (key) {
        used.add(key);
        if (!(key in english)) out.push(`${key}: not in the catalog`);
        else if (says(key) !== value) out.push(`${key}: the page's ${name} says “${value}”, the catalog “${says(key)}”`);
      } else if (name === "alt" && value) out.push(`an image's description with no key: “${value}”`);
    }
  }
  // A link preview's title and description (og:…) carry no key of their own: they say what the page's title and description do.
  for (const [property, key] of [["og:title", "site.title"], ["og:description", "site.description"]]) {
    const m = new RegExp(`<meta\\s+property="${property}"([^>]*)>`).exec(html);
    const value = m ? attr(m[1], "content") : null;
    if (value !== says(key)) out.push(`${property}: the link preview says “${value}”, the catalog's ${key} “${says(key)}”`);
  }
  // What a screen reader says for any element (a video, a button), by its key; only the name stands as it is.
  for (const m of html.slice(html.indexOf("<body")).matchAll(/<([a-z][a-z0-9]*)\b([^>]*\saria-label="[^"]*"[^>]*)>/g)) {
    const attrs = m[2];
    const value = attr(attrs, "aria-label");
    const key = attr(attrs, "data-t-label");
    if (key) {
      used.add(key);
      if (!(key in english)) out.push(`${key}: not in the catalog`);
      else if (says(key) !== value) out.push(`${key}: the page's label says “${value}”, the catalog “${says(key)}”`);
    } else if (value && !AS_IS.has(value)) out.push(`a label with no key: “${value}”`);
  }
  for (const key of Object.keys(english)) if (!used.has(key)) out.push(`${key}: not on the page`);
  return out;
}

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `: ${detail}`}`);
};
const real = problems(page, catalog);
check("the home page: every piece of text has its key and says its English; every key is on it", real.length === 0, real.slice(0, 6).join("; "));
check("every key is the site's (site.…), described", Object.entries(catalog).every(([key, [text, about]]) => key.startsWith("site.") && typeof text === "string" && typeof about === "string" && about.length >= 20));
// Each rule, on a planted page.
const changed = page.replace(">Learn a language for free.<", ">Learn any language for free.<");
check("PLANT the headline changed on the page only: refused", problems(changed, catalog).some((p) => p.startsWith("site.hero.title:")));
const loose = page.replace("</main>", "<p>Words with no key.</p></main>");
check("PLANT a line with no key: refused", problems(loose, catalog).some((p) => p.includes("text with no key")));
const altless = page.replace("</main>", '<img src="/icons/mark.svg" alt="A planted drawing"></main>');
check("PLANT an image's description with no key: refused", problems(altless, catalog).some((p) => p.includes("description with no key")));
const unlabeled = page.replace(' data-t-label="site.hero.clip"', "");
check("PLANT a video's label with no key: refused", unlabeled !== page && problems(unlabeled, catalog).some((p) => p.includes("label with no key")));
const relabeled = page.replace('aria-label="Pause the videos"', 'aria-label="Stop the videos"');
check("PLANT a button's label changed on the page only: refused", relabeled !== page && problems(relabeled, catalog).some((p) => p.startsWith("site.pause:")));
const moved = factWords(catalog, siteValues({ ...SITE_FACTS, languages: SITE_FACTS.languages + 1 }));
check("PLANT the facts changed and the page not written again: refused", problems(page, catalog, moved).some((p) => p.startsWith("site.languages.title:")));
// The languages heading's full courses are counted from the paths, never written in: counted here apart, and a path planted short of a
// full course changes the heading, so a page not written again is refused on it.
const fullPaths = Object.values(SITE_FACTS.lessons).filter((n) => n >= SITE_FACTS.fullCourse).length;
const heading = factWords(catalog).get("site.languages.title");
check("the languages heading counts the paths at a full course's length", siteValues(SITE_FACTS).full === fullPaths && heading.includes(`${fullPaths} full course`), `${fullPaths} paths; the heading says “${heading}”`);
const [shortCode] = Object.keys(SITE_FACTS.lessons).filter((code) => code !== "nl" && SITE_FACTS.lessons[code] >= SITE_FACTS.fullCourse);
const shortened = factWords(catalog, siteValues({ ...SITE_FACTS, lessons: { ...SITE_FACTS.lessons, [shortCode]: SITE_FACTS.fullCourse - 1 } }));
check("PLANT a path short of a full course and the page not written again: refused on the heading", Boolean(shortCode) && shortened.get("site.languages.title").includes(`${fullPaths - 1} full course`) && problems(page, catalog, shortened).some((p) => p.startsWith("site.languages.title:")), shortCode ? shortened.get("site.languages.title") : "no full path but Dutch's to shorten");
const preview = page.replace(/(<meta\s+property="og:description"\s+content=")[^"]*"/, '$1A planted preview from before."');
check("PLANT the link preview's description left as it was: refused", preview !== page && problems(preview, catalog).some((p) => p.startsWith("og:description:")));
const extra = { ...catalog, "site.unused": ["Never shown", "a key the page doesn't carry, planted"] };
check("PLANT a key the page doesn't carry: refused", problems(page, extra).some((p) => p.startsWith("site.unused:")));
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
