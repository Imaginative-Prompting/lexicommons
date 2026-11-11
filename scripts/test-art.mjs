// Our drawings are plain shapes in our own colors, and nothing else: every word picture (public/pictures/) and symbol
// (lx/symbols.js) against lx/art-rules.js, the manifest against the files, art.css against the palette, and the shell without
// the word pictures. A table of what must be refused shows the rules can say no: a script, anything that reaches outside,
// a font, a fixed color. Exit 0 = pass.
//   node scripts/test-art.mjs [--dir <a pictures folder>]
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ART_BYTES, ART_ID, ART_TOKENS, checkArt } from "../public/js/lx/art-rules.js";
import { coverByIdOf, coverChoices, coverOfPack, paintOf, TOPIC_ART, TOPIC_DRAWINGS, TOPIC_PACK_ART } from "../public/js/study/pack-format.js";
import { coverOfBook } from "../public/js/read/book-format.js";
import { SYMBOL_NAMES, symbolFile } from "../public/js/lx/symbols.js";
import { GAME_ART_NAMES, gameArtFile } from "../public/js/lx/game-art.js";
import { STOP_THEMES, stopArtFile } from "../public/js/lx/stop-art.js";
import { STUDIED_DOTS, STUDIED_SPLAT } from "../public/js/character/rig/inkdrop/today-throw.js";
import { LANGUAGE_CODE } from "../public/js/lang/index.js";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const argDir = process.argv.indexOf("--dir");
const DIR = argDir > 0 ? resolve(process.argv[argDir + 1]) : join(ROOT, "public/pictures");
let failed = 0;
const check = (name, problems) => {
  const list = [problems].flat().filter(Boolean);
  if (list.length) failed++;
  console.log(`${list.length ? "FAIL" : "ok  "}  ${name}${list.length ? `: ${list.slice(0, 8).join("; ")}` : ""}`);
};

// ---------- what must be refused ----------
const open = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"';
const sky = "var(--art-sky,#58ADEB)";
const svg = (inner, attrs = open) => `<svg ${attrs}>${inner}</svg>`;
const good = svg(`<clipPath id="c"><rect width="9" height="9"/></clipPath><g clip-path="url(#c)"><rect width="9" height="9" fill="${sky}"/></g><circle cx="1" cy="1" r="1" fill="none" stroke="${sky}"/>`);
check("a plain drawing passes (so what follows is refused for its own reason)", checkArt(good));
check("a line may be drawn: the list allows it, so its x1, y1, x2 and y2 must parse", checkArt(svg(`<line x1="1" y1="2" x2="30" y2="40" stroke="${sky}" stroke-width="2"/>`)));
const REFUSED = {
  "a script": svg("<script>x()</script>"),
  "an empty script": svg("<script/>"),
  "a capital SCRIPT": svg("<SCRIPT/>"),
  "an onload": svg("", `${open} onload="x()"`),
  "an onclick on a shape": svg(`<rect width="1" height="1" onclick="x()"/>`),
  "an image": svg('<image href="https://evil.example/a.png"/>'),
  "foreignObject": svg('<foreignObject width="1" height="1"></foreignObject>'),
  "a use": svg('<use href="https://evil.example/a.svg#b"/>'),
  "a same-file use": svg('<use href="#b"/>'),
  "an anchor": svg('<a href="https://evil.example/"><rect width="1" height="1"/></a>'),
  "a style element": svg("<style>rect{fill:red}</style>"),
  "a style attribute": svg('<rect width="1" height="1" style="fill:red"/>'),
  "text": svg("<text>hi</text>"),
  "a font": svg('<font-face font-family="x"/>'),
  "an animation": svg('<animate attributeName="x" to="1"/>'),
  "a set": svg('<set attributeName="x" to="1"/>'),
  "a filter": svg("<filter/>"),
  "a pattern": svg("<pattern/>"),
  "a gradient": svg("<linearGradient/>"),
  "a mask": svg("<mask/>"),
  "an element named like a built-in": svg("<constructor/>"),
  "a fixed color": svg('<rect width="1" height="1" fill="#ff0000"/>'),
  "a named color": svg('<rect width="1" height="1" fill="red"/>'),
  "currentColor": svg('<rect width="1" height="1" fill="currentColor"/>'),
  "a token that isn't ours": svg('<rect width="1" height="1" fill="var(--evil,#58ADEB)"/>'),
  "a token's fallback off the palette": svg('<rect width="1" height="1" fill="var(--art-sky,#000000)"/>'),
  "a paint from a URL": svg('<rect width="1" height="1" fill="url(https://evil.example/a.svg#b)"/>'),
  "a stroke from a URL": svg('<rect width="1" height="1" stroke="url(#a)"/>'),
  "a clip from a URL": svg('<rect width="1" height="1" clip-path="url(https://evil.example/a.svg#b)"/>'),
  "a clip it doesn't have": svg('<rect width="1" height="1" clip-path="url(#nope)"/>'),
  "a data: URL": svg('<rect width="1" height="1" fill="url(data:image/svg+xml,x)"/>'),
  "a line's end that isn't a number": svg('<line x1="url(x)" y1="2" x2="3" y2="4"/>'),
  "a numbered attribute a shape doesn't have": svg('<rect x1="1" width="1" height="1"/>'),
  "a numbered attribute no shape has": svg('<line x3="1" y1="2" x2="3" y2="4"/>'),
  "a numbered handler": svg('<rect onload1="x()" width="1" height="1"/>'),
  "a comment": svg("<!-- x -->"),
  "text between shapes": svg('hello<rect width="1" height="1"/>'),
  "a doctype": `<!DOCTYPE svg>${svg("")}`,
  "an entity": `<!DOCTYPE svg [<!ENTITY a "b">]>${svg("")}`,
  "an XML declaration": `<?xml version="1.0"?>${svg("")}`,
  "an entity in a value": svg('<rect width="&a;" height="1"/>'),
  "a CDATA": svg("<![CDATA[x]]>"),
  "a second namespace": svg("", `${open} xmlns:xlink="http://www.w3.org/1999/xlink"`),
  "another namespace": svg("", 'xmlns="https://evil.example/" viewBox="0 0 200 200"'),
  "no namespace": svg("", 'viewBox="0 0 200 200"'),
  "a viewBox that isn't square": svg("", 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"'),
  "an svg inside": svg(svg("")),
  "two drawings": good + good,
  "a shape outside the svg": `${good}<rect width="1" height="1"/>`,
  "never closed": `<svg ${open}><g>`,
  "closed out of turn": `<svg ${open}><g></svg></g>`,
  "the same attribute twice": svg('<rect width="1" width="2" height="1"/>'),
  "the same id twice": svg('<clipPath id="a"></clipPath><clipPath id="a"></clipPath>'),
  "a path with something else in it": svg('<path d="M0 0L1 1url(x)"/>'),
  "a transform with something else in it": svg('<g transform="translate(1 1) url(x)"></g>'),
  "too heavy": svg(`<rect width="1" height="1" fill="${sky}"/>`.repeat(Math.ceil(ART_BYTES / 40))),
  "not text": null,
};
const passed = Object.entries(REFUSED).filter(([, text]) => !checkArt(text).length).map(([name]) => name);
check(`refuses ${Object.keys(REFUSED).length} things a drawing may not be`, passed.map((name) => `${name} passed`));
check("a word picture may not take its color from the page; a symbol may", [
  !checkArt(svg('<rect width="1" height="1" fill="currentColor"/>')).length && "a picture with currentColor passed",
  checkArt(svg('<rect width="1" height="1" fill="currentColor"/>'), { symbol: true }).length && "a symbol with currentColor was refused",
  !checkArt(svg('<rect width="1" height="1" fill="red"/>'), { symbol: true }).length && "a symbol with a fixed color passed",
]);
check("a word picture may not name a moving part; a symbol may", [
  !checkArt(svg('<g class="a"></g>')).length && "a picture with a class passed",
  checkArt(svg('<g class="a"></g>'), { symbol: true }).length && "a symbol with a class was refused",
  !checkArt(svg('<g class="a b"></g>'), { symbol: true }).length && "a class that isn't plain passed",
]);
const NAMES_REFUSED = ["", "../x", "a/b", "a.svg", "A", "a b", "a--b", "-a", "a-", "https://evil.example/a", "constructor%2f", "a\n"];
check("a concept's id is never a path or a URL", NAMES_REFUSED.filter((id) => ART_ID.test(id)).map((id) => JSON.stringify(id)));

// ---------- every word picture, and the manifest ----------
const files = readdirSync(DIR).filter((name) => name.endsWith(".svg")).sort();
check(`every word picture passes (${files.length})`, files.flatMap((name) => checkArt(readFileSync(join(DIR, name), "utf8")).map((p) => `${name}: ${p}`)));
// The path's stop colors (stop-*) follow a stop's state, set on each button: a word picture using one would change color with the path.
const stopColors = (text) => [...text.matchAll(/var\(--art-(stop-[a-z-]+),/g)].map((m) => m[1]);
check("no word picture uses a path stop's color", files.flatMap((name) => stopColors(readFileSync(join(DIR, name), "utf8")).map((t) => `${name}: ${t}`)));
check("a word picture with a path stop's color is refused", stopColors(`<path d="M0 0H1V1Z" fill="var(--art-stop-wall-dark,#45309A)"/>`).length ? [] : ["a stop color passed"]);
const others = readdirSync(DIR).filter((name) => !name.endsWith(".svg") && name !== "manifest.json" && !/^words\.[^/]+\.json$/.test(name) && !name.startsWith("."));
check("nothing else in the folder", others);
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const entries = Object.entries(manifest.pictures ?? {});
const entryProblems = [];
for (const [id, entry] of entries) {
  if (!ART_ID.test(id)) entryProblems.push(`${id}: not an id`);
  if (entry.file !== `${id}.svg`) entryProblems.push(`${id}: its file is ${entry.file}`);
  if (!files.includes(entry.file)) entryProblems.push(`${id}: no file`);
  else if (entry.h !== createHash("sha256").update(readFileSync(join(DIR, entry.file))).digest("hex").slice(0, 10)) entryProblems.push(`${id}: its hash is stale (node scripts/stamp-pictures.mjs)`);
  if (typeof entry.alt !== "string" || !entry.alt.trim()) entryProblems.push(`${id}: no alt text`);
  // Which words a drawing is belongs to each language (words.<language>.json), never to the drawing.
  if (Object.hasOwn(entry, "words")) entryProblems.push(`${id}: words in the manifest`);
}
check(`the manifest names each of its ${entries.length} drawings, with alt text and no words`, entryProblems);
const unlisted = files.filter((name) => !entries.some(([, entry]) => entry.file === name));
check("every drawing is in the manifest", unlisted);

// ---------- which drawing a word is: one file per language ----------
// words.<language>.json ({ language, words: { lemma: concept } }): a key is a word the language's own packs teach, a value a drawing in
// the manifest that's a word's (no cover, book or empty state), so a language's file can never name a drawing that isn't there.
const PACKS = resolve(ROOT, "packs");
const taught = new Map(); // language -> { words: Set, glosses: Map lemma -> English, lessonPictures: [[lemma, concept, pack]] }
for (const name of readdirSync(PACKS).filter((n) => n.endsWith(".json"))) {
  const pack = JSON.parse(readFileSync(join(PACKS, name), "utf8"));
  const t = taught.get(pack.language) ?? { words: new Set(), glosses: new Map(), lessonPictures: [] };
  for (const [lemma, gloss] of Object.entries(pack.words ?? {})) {
    t.words.add(lemma);
    if (!t.glosses.has(lemma)) t.glosses.set(lemma, String(gloss));
  }
  for (const lesson of pack.lessons ?? []) for (const word of lesson.words ?? []) if (word.picture) t.lessonPictures.push([word.lemma, word.picture, name]);
  taught.set(pack.language, t);
}
const notAWord = (id) => /^(pack|book|empty)-/.test(id);
function wordsProblems(name, text, pictures = manifest.pictures) {
  const problems = [];
  const m = /^words\.(.+)\.json$/.exec(name);
  const language = m?.[1];
  if (!language || !LANGUAGE_CODE.test(language)) return [`${name}: not words.<language>.json`];
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [`${name}: not JSON`];
  }
  if (data?.language !== language) problems.push(`${name}: says it's ${JSON.stringify(data?.language)}`);
  if (!data?.words || typeof data.words !== "object" || Array.isArray(data.words)) return [...problems, `${name}: no words`];
  const t = taught.get(language);
  if (!t) problems.push(`${name}: no pack of ours teaches ${language}`);
  for (const [lemma, concept] of Object.entries(data.words)) {
    if (!t?.words.has(lemma)) problems.push(`${name}: ${JSON.stringify(lemma)} isn't a word ${language}'s packs teach`);
    if (typeof concept !== "string" || !ART_ID.test(concept) || !Object.hasOwn(pictures, concept)) problems.push(`${name}: ${JSON.stringify(lemma)} names ${JSON.stringify(concept)}, which isn't drawn`);
    else if (notAWord(concept)) problems.push(`${name}: ${JSON.stringify(lemma)} names ${concept}, which is no word's drawing`);
  }
  return problems;
}
const wordFiles = readdirSync(DIR).filter((name) => /^words\..+\.json$/.test(name)).sort();
const wordsOf = new Map(wordFiles.map((name) => [name.slice(6, -5), JSON.parse(readFileSync(join(DIR, name), "utf8")).words ?? {}]));
const namedByWords = new Set([...wordsOf.values()].flatMap((words) => Object.values(words)));
check(`each language's words name drawings, and only words its packs teach (${wordFiles.length} languages)`, [
  ...(wordFiles.length ? [] : ["no words.<language>.json at all: nothing can tell"]),
  ...wordFiles.flatMap((name) => wordsProblems(name, readFileSync(join(DIR, name), "utf8"))),
]);
const plantedWords = (words, language = "nl") => wordsProblems(`words.${language}.json`, JSON.stringify({ language, words }));
check("a language's words are refused for a word it doesn't teach, an undrawn or made-up concept, a cover, or a wrong language", [
  plantedWords({ huis: "house" }).length ? `the control, a taught word naming a drawing, was refused: ${plantedWords({ huis: "house" }).join("; ")}` : null,
  !plantedWords({ huisjeboompjebeestje: "house" }).length && "a word no pack teaches passed",
  !plantedWords({ huis: "a-concept-nobody-drew" }).length && "an undrawn concept passed",
  !plantedWords({ huis: "../house" }).length && "a path passed",
  !plantedWords({ huis: "pack-words-nl-01" }).length && "a cover passed",
  !plantedWords({ huis: "empty-offline" }).length && "an empty state passed",
  !wordsProblems("words.nl.json", JSON.stringify({ language: "fr", words: {} })).length && "a file saying it's another language passed",
  !wordsProblems("words.../x.json", JSON.stringify({ language: "nl", words: {} })).length && "a name that isn't a language passed",
]);
// A drawing a lesson word names is kept for offline with its language's (study/pictures.js keepNow reads the lessons' own drawings from the
// content view: the keep check below), so no words line need name it. A lesson can draw the sense it teaches (path-nl's l122: licht as light,
// not heavy, a feather on a plank) where the word's own is another (licht, the light: the bulb), or where the word's other sentences use another
// sense and it has no line at all (Spanish en: in one lesson, on the table in others). It must be a word's drawing, never a cover or an empty state.
const lessonDrawingProblems = (lessonPictures) =>
  lessonPictures.filter(([, concept]) => Object.hasOwn(manifest.pictures, concept) && notAWord(concept)).map(([lemma, concept, pack]) => `${pack}: ${lemma} → ${concept}`);
check("every drawing a lesson word of ours names is a word's drawing", [
  ...[...taught].flatMap(([, t]) => lessonDrawingProblems(t.lessonPictures)),
  !lessonDrawingProblems([["koffie", "empty-offline", "planted.json"]]).length && "a lesson word drawn as an empty state passed",
  !lessonDrawingProblems([["koffie", "pack-words-nl-01", "planted.json"]]).length && "a lesson word drawn as a cover passed",
  lessonDrawingProblems([["koffie", "coffee", "planted.json"]]).length && "the control, a lesson word drawn as a word's drawing, was refused",
]);
const picturesSource = readFileSync(join(ROOT, "public/js/study/pictures.js"), "utf8");
check("the app reads a language's words by the same language codes as everything else", /export const WORDS_LANGUAGE = (\/.*\/);/.exec(picturesSource)?.[1] === String(LANGUAGE_CODE) ? [] : ["study/pictures.js WORDS_LANGUAGE isn't lang/index.js LANGUAGE_CODE"]);
check("the app no longer reads words from the manifest", /entry\.words|\.words\?\.\[language\]/.test(picturesSource) ? ["study/pictures.js still reads entry.words"] : []);

async function pictureKeepProblems(idle) {
  await import("../public/js/study/path.js");
  const names = ["fetch", "caches", "location", "addEventListener", "removeEventListener", "requestIdleCallback", "cancelIdleCallback", "setTimeout", "clearTimeout"];
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const problems = [];
  const events = new EventTarget();
  const scheduled = new Map();
  const pending = new Set();
  const asked = [];
  const turns = new Map();
  let turn = 0;
  let next = 0;
  let peak = 0;
  const ids = Array.from({ length: 14 }, (_, i) => `picture-${i}`);
  const urls = ids.map((id) => `/pictures/${id}.svg?h=test`);
  // Beside the words' 14: one only a lesson word of the language draws (keepPictureLesson's pack, in the content view), and one nothing names.
  const LESSON_ONLY = "/pictures/picture-lesson.svg?h=test";
  const NOBODY = "/pictures/picture-nobody.svg?h=test";
  const stored = new Map([[urls[0], new Response("svg", { headers: { "content-length": "3" } })]]);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const schedule = (fn) => { scheduled.set(++next, fn); return next; };
  const runIdle = () => {
    const entry = scheduled.entries().next().value;
    if (!entry) return;
    scheduled.delete(entry[0]);
    turn++;
    entry[1]({ timeRemaining: () => 50 });
  };
  const release = () => { for (const finish of [...pending]) finish(); };
  const drain = async (work) => {
    let done = false;
    work.finally(() => { done = true; });
    for (let i = 0; i < 100 && !done; i++) {
      release();
      await flush();
      runIdle();
      await flush();
    }
    if (!done) throw new Error("the picture keep didn't finish");
    return work;
  };
  try {
    globalThis.location = { href: "https://pictures.test/app/#today" };
    globalThis.addEventListener = events.addEventListener.bind(events);
    globalThis.removeEventListener = events.removeEventListener.bind(events);
    globalThis.requestIdleCallback = idle ? schedule : undefined;
    globalThis.cancelIdleCallback = (id) => scheduled.delete(id);
    globalThis.setTimeout = schedule;
    globalThis.clearTimeout = (id) => scheduled.delete(id);
    globalThis.caches = { open: async () => ({
      match: async (url) => stored.get(url),
      put: async (url, response) => stored.set(url, response),
      keys: async () => [...stored.keys()].map((url) => ({ url: new URL(url, location.href).href })),
      delete: async (request) => stored.delete(typeof request === "string" ? request : new URL(request.url).pathname + new URL(request.url).search),
    }) };
    globalThis.fetch = async (url, options = {}) => {
      if (url === "/pictures/manifest.json") return Response.json({ pictures: Object.fromEntries([...ids, "picture-lesson", "picture-nobody"].map((id) => [id, { file: `${id}.svg`, h: "test" }])) });
      if (url === "/pictures/words.nl.json") return Response.json({ language: "nl", words: Object.fromEntries(ids.map((id) => [id, id])) });
      asked.push(url);
      turns.set(turn, (turns.get(turn) ?? 0) + 1);
      return new Promise((resolve, reject) => {
        const finish = () => {
          pending.delete(finish);
          options.signal?.removeEventListener("abort", abort);
          resolve(new Response("svg"));
        };
        const abort = () => {
          pending.delete(finish);
          reject(new Error("aborted"));
        };
        pending.add(finish);
        peak = Math.max(peak, pending.size);
        if (options.signal?.aborted) abort();
        else options.signal?.addEventListener("abort", abort, { once: true });
      });
    };
    const { keepPicturesForOffline } = await import(`../public/js/study/pictures.js?keep-test=${idle}`);
    const work = keepPicturesForOffline("nl");
    await flush();
    if (asked.length) problems.push(`${asked.length} picture request before idle`);
    const result = await drain(work);
    if (peak > 4) problems.push(`${peak} picture requests in flight, limit 4`);
    if ([...turns.values()].some((n) => n > 4)) problems.push(`${Math.max(...turns.values())} pictures without another idle turn, limit 4`);
    if (asked.includes(urls[0]) || result.already !== 1) problems.push(`kept pictures weren't skipped: ${JSON.stringify(result)}`);
    if (!asked.includes(LESSON_ONLY)) problems.push("a drawing only a lesson word names wasn't kept");
    if (asked.includes(NOBODY)) problems.push("a drawing no word and no lesson names was kept");
    if (result.kept !== 14) problems.push(`${result.kept} kept, not the words' 13 still to keep and the lesson's 1`);
    const count = asked.length;
    await drain(keepPicturesForOffline("nl"));
    if (asked.length !== count) problems.push("a second keep fetched pictures already kept");
    for (const [event, duringFetch] of [["hashchange", false], ["hashchange", true], ["pagehide", true]]) {
      for (const url of urls.slice(1)) stored.delete(url);
      const keeping = keepPicturesForOffline("nl");
      await flush();
      if (duringFetch) {
        runIdle();
        await flush();
      }
      const before = asked.length;
      if (event === "hashchange") location.href += "/next";
      events.dispatchEvent(new Event(event));
      await flush();
      if (pending.size) problems.push(`${event} left a picture request running`);
      const stopped = await drain(keeping);
      if (asked.length !== before || stopped.stoppedBy !== "stopped") problems.push(`${event} didn't stop the keep: ${asked.length - before} further requests, ${stopped.stoppedBy}`);
    }
  } catch (error) {
    problems.push(error.message);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
  return problems.map((problem) => `${idle ? "idle callback" : "timeout"}: ${problem}`);
}
// The content view the keep reads: a pack of Dutch (the language a device starts on) whose one lesson draws its word with picture-lesson,
// a drawing no words line names.
async function keepPictureLesson() {
  const { savePack } = await import("../public/js/study/packs.js");
  const saved = await savePack({
    format: "lexicommons-pack", version: 2, id: "keep-test-nl", name: "Keep test", about: "A lesson that draws its own word.", language: "nl", from: "en",
    items: [{ id: "a1", text: "Ik drink koffie.", means: "I drink coffee.", words: [["Ik", "ik"], ["drink", "drinken"], ["koffie", "koffie"]], punct: ".", concepts: [] }],
    lessons: [{ id: "l1", title: "Koffie", items: ["a1"], words: [{ lemma: "koffie", forms: ["koffie"], picture: "picture-lesson", means: "the coffee" }] }],
  });
  if (!saved.ok) throw new Error(`the keep test's pack: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
await keepPictureLesson();
check("pictures are kept in idle batches of at most four, skip kept drawings, keep a lesson's own drawing and stop on navigation", [
  ...await pictureKeepProblems(true),
  ...await pictureKeepProblems(false),
]);

// ---------- what a drawing says to a screen reader: alt ----------
// One English alt per drawing, the source for every interface language later: plain and short, and never the answer in the language
// being learned. A word that's English too (its own gloss says it: "in", "bed", "film") isn't the answer given away.
function altProblems(id, alt, words = wordsOf) {
  const problems = [];
  if (typeof alt !== "string" || !alt.trim()) return [`${id}: no alt`];
  if (alt.length > 80) problems.push(`${id}: ${alt.length} characters`);
  if (/\b(picture|image|drawing|illustration|icon) of\b|\.svg\b/i.test(alt) || ART_ID.test(alt) && alt === id) problems.push(`${id}: ${JSON.stringify(alt)} says what it is, not what it shows`);
  for (const [language, map] of words) {
    const glosses = taught.get(language)?.glosses;
    for (const [lemma, concept] of Object.entries(map)) {
      if (concept !== id) continue;
      if ((glosses?.get(lemma) ?? "").toLowerCase().split(/[^\p{L}']+/u).includes(lemma.toLowerCase())) continue;
      if (new RegExp(`(^|[^\\p{L}])${lemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu").test(alt)) problems.push(`${id}: its alt says ${language}'s ${JSON.stringify(lemma)}`);
    }
  }
  return problems;
}
check(`every drawing's alt is plain English, short, and never the word it's for (${entries.length})`, entries.flatMap(([id, entry]) => altProblems(id, entry.alt)));
check("an alt is refused empty, long, naming itself, or saying the word in the language being learned", [
  !altProblems("house", "").length && "an empty alt passed",
  !altProblems("house", "A house with a very long description that goes on and on past what a translator gets").length && "a long alt passed",
  !altProblems("house", "A picture of a house").length && "\"picture of\" passed",
  !altProblems("house", "Het huis", new Map([["nl", { huis: "house" }]])).length && "a Dutch word in the alt passed",
  altProblems("in", "A ball in a box", new Map([["nl", { in: "in" }]])).length && "an English word that's Dutch too was refused",
]);
check("a drawing can't carry lettering: text is refused", [
  !checkArt(`<svg ${open}><text x="1" y="1">huis</text></svg>`).length && "a <text> passed",
]);
// ---------- a book's drawn cover, and the empty states ----------
const bookCovers = ["novel", "stories", "children", "nonfiction"].flatMap((kind) => ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => coverOfBook({ kind, id })));
check("each kind of book has a drawn cover in the manifest, in two colors", [
  ...bookCovers.filter((id) => !Object.hasOwn(manifest.pictures, id)),
  ...(new Set(bookCovers).size === 8 ? [] : [`${new Set(bookCovers).size} covers, not 8`]),
]);
const shelfOf = Array.from({ length: 60 }, (_, i) => coverOfBook({ id: `book-${i}` }));
check("a shelf of books that say nothing about their kind isn't all one drawing: all four kinds and both colors", new Set(shelfOf).size === 8 ? [] : [`${new Set(shelfOf).size} covers: ${[...new Set(shelfOf)].join(", ")}`]);
check("the same book always gets the same cover, and anything else still gets one", [
  ...(coverOfBook({ id: "x" }) === coverOfBook({ id: "x" }) ? [] : ["it changed"]),
  ...[{}, null, undefined, { kind: "constructor" }].filter((book) => !Object.hasOwn(manifest.pictures, coverOfBook(book))).map((book) => JSON.stringify(book)),
]);
// A book on the shelf with no cover of its own gets a drawing of that book, not a kind's: its best-known image, drawn for it.
const seedBooks = JSON.parse(readFileSync(resolve(DIR, "../../library/catalogue-seed.json"), "utf8")).books;
const coverless = seedBooks.filter((book) => !book.cover && !book.pictures);
check(`each of the shelf's ${coverless.length} books with no cover of its own has its own drawing, and coverOfBook gives it`, [
  ...(coverless.length ? [] : ["no coverless book on the shelf: this check can't tell"]),
  ...coverless.filter((book) => coverOfBook(book) !== `book-${book.id}` || !Object.hasOwn(manifest.pictures, `book-${book.id}`)).map((book) => `${book.id}: ${coverOfBook(book)}`),
]);
check("a book's own drawing is no language's word, so no game offers it", coverless.filter((book) => !manifest.pictures[`book-${book.id}`] || namedByWords.has(`book-${book.id}`)).map((book) => book.id));
const SUBJECTS = [
  [{ subjects: ["Short stories"] }, "stories"], [{ topics: ["fairy tales"] }, "children"], [{ subjects: ["Children's literature"] }, "children"],
  [{ subjects: ["Non-fiction", "History"] }, "nonfiction"], [{ topics: ["history"] }, "nonfiction"], [{ subjects: ["Science fiction"] }, "novel"], [{ subjects: ["Novels"] }, "novel"],
];
check("a book's subjects or topics choose its kind", SUBJECTS.flatMap(([book, kind]) => ["a", "b", "c", "d"].filter((id) => !coverOfBook({ ...book, id }).startsWith(`book-${kind}`)).map((id) => `${JSON.stringify(book)} ${id}: ${coverOfBook({ ...book, id })}`)));
const EMPTY_STATES = ["empty-library", "empty-found", "empty-packs", "empty-practice", "empty-requests", "empty-offline"];
check("each empty state has its drawing, is no language's word, and is kept for offline", EMPTY_STATES.filter((id) => !manifest.pictures[id] || namedByWords.has(id) || manifest.pictures[id].keep !== true));

// ---------- a ready-made pack's cover ----------
const packIds = readdirSync(resolve(DIR, "../../packs")).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));
check(`each of the ${packIds.length} ready-made packs, and grammar, has a drawn cover in the manifest`, ["grammar", ...packIds].filter((id) => !Object.hasOwn(manifest.pictures, coverOfPack(id) ?? "")));
// A topic's tile and its packs' covers: Explore shows a topic's picture beside its packs (its page's head over them, the topics over the
// shelves), so no picture is two of them, and each pack of a topic and language gets its own: nl-food-1, nl-food-2, fr-food-1 like it.
const topicPictures = Object.entries(TOPIC_PACK_ART).flatMap(([topic, art]) => [[`${topic}'s tile`, TOPIC_ART[topic]], ...art.map((id, n) => [`${topic} pack ${n + 1}`, id])]);
const seenPicture = new Map();
check(`each topic's tile and its two packs' covers (${topicPictures.length}) are drawings of their own, none the same picture twice`, [
  ...topicPictures.filter(([, id]) => !Object.hasOwn(manifest.pictures, id ?? "")).map(([what, id]) => `${what}: ${id} isn't drawn`),
  ...topicPictures.filter(([what, id]) => seenPicture.has(id) || !seenPicture.set(id, what)).map(([what, id]) => `${what}: ${id} is also ${seenPicture.get(id)}'s`),
  ...[1, 2].map((n) => `nl-food-${n}`).filter((id, n) => coverOfPack(id) !== TOPIC_PACK_ART.food[n] || coverOfPack(id.replace("nl", "fr")) !== TOPIC_PACK_ART.food[n]).map((id) => `${id}: ${coverOfPack(id)}`),
  ...["nl-food-3", "nl-food", "nl-dinner-1", "../nl-food-1", "nl-food-1x", "a1b2c3-food-1"].filter((id) => coverOfPack(id) !== null).map((id) => `${id} has one`),
]);
// A learner's pack's covers (TOPIC_DRAWINGS): drawn, and never its topic's own picture or one of its topic's packs' (a shelf of the topic
// would show it twice); the one by its id never twice on a shelf until the set runs out; its paint never the drawing's ground.
const ownOf = (topic) => new Set([TOPIC_ART[topic], ...(TOPIC_PACK_ART[topic] ?? [])]);
// Drawings that aren't a cover's to use yet: the dog is the stand-in for a body from before the rig, out until the rig's figures are approved.
const NOT_YET = ["dog"];
const used = new Set();
const shelf = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => coverByIdOf(`pack-${id}`, ["food"], used));
check(`every topic's covers for learners' packs (${Object.keys(TOPIC_DRAWINGS).length} topics) are drawn, and none is the topic's own or its packs'`, [
  ...Object.keys(TOPIC_ART).filter((topic) => !TOPIC_DRAWINGS[topic]?.length).map((topic) => `${topic} has none`),
  ...Object.entries(TOPIC_DRAWINGS).flatMap(([topic, set]) => set.filter((id) => !Object.hasOwn(manifest.pictures, id)).map((id) => `${topic}: ${id} isn't drawn`)),
  ...Object.entries(TOPIC_DRAWINGS).flatMap(([topic, set]) => set.filter((id) => ownOf(topic).has(id)).map((id) => `${topic}: ${id} is its own`)),
  ...Object.entries(TOPIC_DRAWINGS).flatMap(([topic, set]) => set.filter((id) => NOT_YET.includes(id)).map((id) => `${topic}: ${id} isn't a cover's to use yet`)),
  ...(new Set(shelf.slice(0, TOPIC_DRAWINGS.food.length)).size === TOPIC_DRAWINGS.food.length ? [] : [`a shelf of food packs repeats before the set runs out: ${shelf.join(", ")}`]),
  ...(coverChoices(["food", "travel"]).length === new Set([...TOPIC_DRAWINGS.food, ...TOPIC_DRAWINGS.travel]).size ? [] : ["coverChoices names one twice"]),
  ...(coverByIdOf("x", []) === null ? [] : ["a pack with no topic got a drawing"]),
  ...["teal", "sun", "violet"].filter((ground) => ["a", "b", "c", "d", "e"].some((id) => paintOf(id, ground) === ground)).map((ground) => `a ${ground} paint under a ${ground} drawing`),
]);
check("a cover is no language's word, so no game or lesson offers it", entries.filter(([id]) => /^(pack|book)-/.test(id) && namedByWords.has(id)).map(([id]) => id));
// English's starters (starter-en, from Spanish, and starter-en-from-<code> for each other language its learners speak): each drawn, the three
// fields across them; an id that only looks like one gets none.
const { LANGUAGES } = await import("../public/js/lang/index.js");
const englishStarters = ["starter-en", ...Object.keys(LANGUAGES).filter((code) => code !== "en" && code !== "es").map((code) => `starter-en-from-${code.toLowerCase()}`)];
check(`each of English's ${englishStarters.length} starters has a drawn cover, and they aren't one color`, [
  ...englishStarters.filter((id) => !Object.hasOwn(manifest.pictures, coverOfPack(id) ?? "")).map((id) => `${id}: ${coverOfPack(id)}`),
  ...(new Set(englishStarters.map(coverOfPack)).size === 3 ? [] : ["English's starters don't use all three fields"]),
  ...["starter-en-from-", "starter-en-from", "starter-en-to-ja", "starter-en-from-ja-x-y"].filter((id) => coverOfPack(id) !== null).map((id) => `${id} has one`),
]);
check("a shared pack gets no drawn cover, and a shelf of starters isn't one color", [
  ...["a1b2c3", "starter-", "path-zz", "words-nl-11", "../coffee", null].filter((id) => coverOfPack(id) !== null).map((id) => `${id} has one`),
  ...(new Set(packIds.filter((id) => id.startsWith("starter-")).map(coverOfPack)).size === 3 ? [] : ["starters don't use all three fields"]),
]);

// ---------- every symbol ----------
check(`every symbol passes (${SYMBOL_NAMES.length})`, SYMBOL_NAMES.flatMap((name) => checkArt(symbolFile(name), { symbol: true }).map((p) => `${name}: ${p}`)));
check("no symbol's ids need more than the file (each is made unique when it's drawn)", SYMBOL_NAMES.filter((name) => /url\((?!#)/.test(symbolFile(name))));
// Study's game drawings, in their own module so the first load doesn't carry them: held to the same rules, and each game has its small one-ink one in symbols.js.
check(`every game drawing passes (${GAME_ART_NAMES.length})`, GAME_ART_NAMES.flatMap((id) => checkArt(gameArtFile(id), { symbol: true }).map((p) => `${id}: ${p}`)));
check("every game drawing has its small one in symbols.js", GAME_ART_NAMES.filter((id) => !SYMBOL_NAMES.includes(`game-${id}-q`)));
check("no large game drawing is left in symbols.js", SYMBOL_NAMES.filter((name) => /^game-[a-z]+$/.test(name)));
// The lesson path's stops: real solids that are the buttons themselves, one per theme symbol, plus the grand stop. Each has the two parts a press moves.
check(`every path stop passes (${STOP_THEMES.length})`, STOP_THEMES.flatMap((theme) => checkArt(stopArtFile(theme), { symbol: true }).map((p) => `${theme}: ${p}`)));
check("every lesson theme has its stop, and so does the grand stop", [...SYMBOL_NAMES.filter((name) => name.startsWith("theme-") && name !== "theme-unit").map((name) => name.slice(6)), "unit"].filter((theme) => !STOP_THEMES.includes(theme)));
check("every stop has a far half that stays and a near half that presses", STOP_THEMES.filter((theme) => !stopArtFile(theme).includes('class="lx-stop-lip"') || !stopArtFile(theme).includes('class="lx-stop-top"')));

const studied = symbolFile("studied");
check("Tinta's throw settles into the studied symbol's own outline", [
  !studied.includes(STUDIED_SPLAT) && "its splat differs from the rig's",
  ...STUDIED_DOTS.filter(([x, y, r]) => !studied.includes(`cx="${x}" cy="${y}" r="${r}"`)).map(([x, y]) => `its dot at ${x},${y} differs from the rig's`),
]);

// ---------- the palette, in the one stylesheet and the rules ----------
const css = readFileSync(join(ROOT, "public/css/lx/art.css"), "utf8");
const color = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
const inColor = Object.fromEntries([...color.matchAll(/--art-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(([, name, hex]) => [name, hex.toUpperCase()]));
const ink = /\[data-art="theme"\] \{\s*--art-tile([\s\S]*?)\}/.exec(css)?.[1] ?? "";
const inInk = new Set([...`--art-tile${ink}`.matchAll(/--art-([a-z-]+):/g)].map(([, name]) => name));
check("art.css colors every token as the rules do", [
  ...Object.entries(ART_TOKENS).filter(([name, hex]) => inColor[name] !== hex).map(([name, hex]) => `${name}: ${inColor[name]} in art.css, ${hex} in the rules`),
  ...Object.keys(inColor).filter((name) => name !== "tile" && !ART_TOKENS[name]).map((name) => `${name} isn't in the rules`),
  !inColor.tile && "no tile",
]);
check("art.css has every token in the theme's ink", [...Object.keys(ART_TOKENS), "tile"].filter((name) => !inInk.has(name)).map((name) => `${name} has no ink`));

// ---------- fetched when needed, not in the shell ----------
const sw = readFileSync(join(ROOT, "public/sw.js"), "utf8");
const shell = /const SHELL = \[([\s\S]*?)\];/.exec(sw)?.[1] ?? "";
const never = /const NEVER_CACHE = \[([\s\S]*?)\];/.exec(sw)?.[1] ?? "";
check("the shell has the rules, loader, symbols and palette, and no word picture", [
  ...["/css/lx/art.css", "/js/lx/art-rules.js", "/js/lx/symbols.js", "/js/study/pictures.js"].filter((path) => !shell.includes(`"${path}"`)).map((path) => `${path} isn't in it`),
  shell.includes('"/pictures/') && "a word picture's in it",
  !never.includes('"/pictures/"') && "the worker would keep word pictures (they have their own cache)",
]);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
