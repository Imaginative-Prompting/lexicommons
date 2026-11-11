// Checks right-to-left layout in headless Chrome on the real /design page, with a test language that runs right to
// left (registered in the page only): the literal line in the language's order (right to left, under its sentence,
// each English chunk left to right, the end mark at the left and in its English form) and in English order (left to
// right), the flip between them animated from where each word really was, and Arrange (its rows right to left, a tap
// placing the next word to the left, a drag landing in the slot it was dropped on, English tiles reading left to right,
// the right order's row right to left), Hebrew, Arabic and Urdu text in their own fonts (downloaded only when shown),
// Arabic's script mark in place of a flag, Choose's sentences and a wrong mark on the right side, and Fill's choices
// (running from the right, with their vowel marks while the word is new), a quoted run inside English kept on one line,
// and a romanization over a Hebrew-script word (Yiddish), centered with its punctuation outside; and the reader
// (demo readers, as /design mounts them): a right-to-left book's page, its turns by tap, key and drag, a held run
// copied in order, a spread whose first page is on the right, and right-to-left words woven into an English book with
// the space after each where the line shows it. By rectangles and computed styles on the page, so it can tell where
// things are.
//
// Usage (headless Chrome, so through the parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "rtl check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/rtl-check.mjs http://localhost:<port> <outDir>

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const [BASE = "http://localhost:8787", outArg = "rtl-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });

const results = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const near = (a, b, pad = 1) => Math.abs(a - b) <= pad;

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
await page.goto(`${BASE}/design/`);

const notoFaces = () => page.evaluate(() => Object.fromEntries([...document.fonts].filter((f) => f.family.includes("Noto")).map((f) => [f.family.replace(/"/g, ""), f.status])));
await stage("a page with no Hebrew or Arabic letters downloads none of their fonts", async () => {
  // The app's first screen (/design shows Hebrew's vowel marks, so it isn't such a page).
  const plain = await browser.newPage({ viewport: { width: 480, height: 900 } });
  await plain.goto(`${BASE}/app/`);
  await plain.waitForTimeout(800);
  await plain.evaluate(() => document.fonts.ready);
  const faces = await plain.evaluate(() => Object.fromEntries([...document.fonts].filter((f) => f.family.includes("Noto")).map((f) => [f.family.replace(/"/g, ""), f.status])));
  const letters = await plain.evaluate(() => /[\u0590-\u05FF\u0600-\u06FF\u0E00-\u0E7F\u0900-\u0AFF]/.test(document.body.innerText));
  await plain.close();
  assert(!letters, "the app's first screen has Hebrew, Arabic, Thai, Devanagari, Gurmukhi or Gujarati letters");
  assert(Object.keys(faces).length === 9, `the Noto faces declared (Hebrew, Arabic, Urdu, Armenian, Georgian, Thai, Devanagari, Gurmukhi, Gujarati): ${JSON.stringify(faces)}`);
  assert(Object.values(faces).every((s) => s === "unloaded"), JSON.stringify(faces));
});

// The test language and the parts, on a plain stage over the page.
await page.evaluate(async () => {
  const { LANGUAGES } = await import("/js/lang/index.js");
  LANGUAGES.xr = { name: "Right-to-left test", locale: "xr-XR", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", ends: ["؟", "۔"], patterns: {} };
  const ui = await import("/js/lx/ui.js");
  const motion = await import("/js/lx/motion.js");
  Object.assign(window, { ui, motion });
  // Styled through the CSSOM: the page's CSP refuses a style attribute.
  const stage = ui.el("div", { id: "rtl-stage" });
  Object.assign(stage.style, { position: "fixed", inset: "0", zIndex: "99999", overflow: "auto", padding: "24px", background: "var(--surface, #000)", display: "flex", flexDirection: "column", gap: "24px", width: "432px" });
  document.body.append(stage);
});
const rects = (selector) => page.$$eval(selector, (nodes) => nodes.map((n) => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, width: r.width, text: n.textContent, dir: getComputedStyle(n).direction }; }));
// The literal line's chunks by their place in the language's order (data-i), whatever order the page holds them in.
const chunks = () => page.$$eval("#rtl-line [data-part=literal-chunk]", (nodes) => nodes.map((n) => { const r = n.getBoundingClientRect(); return { i: Number(n.getAttribute("data-i")), left: r.left, right: r.right, text: n.textContent, dir: getComputedStyle(n).direction }; }).sort((a, b) => a.i - b.i));
const finish = () => page.evaluate(() => window.motion.finishAll());

// I / you / see: the language's order puts the verb last; English moves it second. Every chunk keeps its case in
// both orders, so a word's place is all that changes.
await page.evaluate(() => {
  const item = { literal: [{ text: "I" }, { text: "you", moved: true }, { text: "see", moved: true }], punct: "؟", english: [0, 2, 1], natural: "I see you." };
  const sentence = window.ui.el("p", { id: "rtl-sentence", lang: "xr" }, "أنا إياك أرى؟");
  const line = window.ui.literalLine(item, { lang: "xr", name: "Right-to-left test" });
  line.id = "rtl-line";
  window.rtlLine = line;
  const dutch = window.ui.literalLine({ literal: [{ text: "I" }, { text: "see" }], punct: ".", english: [0, 1], natural: "I see." }, { lang: "nl" });
  dutch.id = "ltr-line";
  document.getElementById("rtl-stage").append(sentence, line, dutch);
});

await stage("the literal line in the language's order runs right to left, its end mark at the left in English form", async () => {
  const line = await page.$eval("#rtl-line", (n) => ({ dir: n.getAttribute("dir"), computed: getComputedStyle(n).direction }));
  assert(line.dir === "rtl" && line.computed === "rtl", `the line is ${JSON.stringify(line)}`);
  const [i, you, see] = await chunks();
  assert(i.right > you.right && you.right > see.right, `chunks from the right: I ${i.right}, you ${you.right}, see ${see.right}`);
  assert([i, you, see].every((c) => c.dir === "ltr"), `each English chunk reads left to right: ${[i, you, see].map((c) => c.dir)}`);
  const [punct] = await rects("#rtl-line > .lx-punct");
  assert(punct.text === "?", `the end mark is "${punct.text}"`);
  // It sits against the last chunk, inside a moved chunk's padded mark (3px), so its middle is what's to the left.
  assert(punct.left + punct.width / 2 < see.left, `the end mark (${punct.left}–${punct.right}) sits left of the last chunk (left ${see.left})`);
  return `I ${Math.round(i.left)}, you ${Math.round(you.left)}, see ${Math.round(see.left)}, ? ${Math.round(punct.left)}`;
});

await stage("a left-to-right language's literal line has no dir, as before", async () => {
  const line = await page.$eval("#ltr-line", (n) => ({ dir: n.getAttribute("dir"), chunkDirs: [...n.children].map((c) => c.getAttribute("dir")), computed: getComputedStyle(n).direction }));
  assert(line.dir === null && line.chunkDirs.every((d) => d === null) && line.computed === "ltr", JSON.stringify(line));
});

await stage("in English order the line runs left to right, its end mark at the right", async () => {
  await page.evaluate(() => window.rtlLine.lxSetOrder("english", { animate: false }));
  const dir = await page.$eval("#rtl-line", (n) => n.getAttribute("dir"));
  assert(dir === "ltr", `the line's dir is ${dir}`);
  const [i, you, see] = await chunks();
  assert(i.left < see.left && see.left < you.left, `chunks from the left: I ${i.left}, see ${see.left}, you ${you.left}`);
  const [punct] = await rects("#rtl-line > .lx-punct");
  assert(punct.left + punct.width / 2 > you.right, `the end mark (${punct.left}–${punct.right}) sits right of the last chunk (right ${you.right})`);
  await page.screenshot({ path: join(OUT, "literal-english-order.png"), clip: { x: 0, y: 0, width: 480, height: 200 } });
});

await stage("flipping back animates each word from where it really was, and lands right to left", async () => {
  const before = await chunks();
  // Hold every animation at its start: each word must still be drawn where it was.
  const atStart = await page.evaluate(() => {
    window.rtlLine.lxSetOrder("dutch");
    const animations = [...window.rtlLine.children].flatMap((child) => child.getAnimations());
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 0;
    }
    return animations.length;
  });
  assert(atStart > 0, "the flip drew nothing");
  const held = await chunks();
  held.forEach((r, k) => assert(near(r.left, before[k].left), `${r.text} starts at ${r.left}, but was at ${before[k].left}`));
  await finish();
  const dir = await page.$eval("#rtl-line", (n) => n.getAttribute("dir"));
  assert(dir === "rtl", `the line's dir is ${dir}`);
  const [i, you, see] = await chunks();
  assert(i.right > you.right && you.right > see.right, `chunks from the right: I ${i.right}, you ${you.right}, see ${see.right}`);
  await page.screenshot({ path: join(OUT, "literal-language-order.png"), clip: { x: 0, y: 0, width: 480, height: 200 } });
  return `${atStart} animations held at their start`;
});

// Arrange in the language's order: its words, and then English chunks.
await page.evaluate(() => {
  const words = ["واحد", "اثنان", "ثلاثة"];
  const game = window.ui.arrange(words, words, { lang: "xr", order: "xr" });
  game.id = "rtl-arrange";
  const english = window.ui.arrange(["a book", "I have"], ["I have", "a book"], { lang: "en", order: "xr" });
  english.id = "rtl-arrange-en";
  document.getElementById("rtl-stage").append(game, english);
});

await stage("Arrange's rows run right to left, and tapping places each next word to the left", async () => {
  const rows = await page.$$eval("#rtl-arrange :is([data-part=arrange-answer], [data-part=arrange-bank])", (nodes) => nodes.map((n) => n.getAttribute("dir")));
  assert(rows.every((d) => d === "rtl"), `rows: ${rows}`);
  await page.click('#rtl-arrange [data-part=arrange-bank] [data-word="واحد"]');
  await page.click('#rtl-arrange [data-part=arrange-bank] [data-word="اثنان"]');
  await finish();
  const [one, two] = await rects("#rtl-arrange [data-part=arrange-answer] [data-part=tile]");
  assert(one.text === "واحد" && two.text === "اثنان", `placed: ${one.text}, ${two.text}`);
  assert(one.right > two.right, `the first placed (right ${one.right}) sits right of the second (right ${two.right})`);
});

await stage("a word dragged between two placed words lands between them", async () => {
  const [one, two] = await rects("#rtl-arrange [data-part=arrange-answer] [data-part=tile]");
  const [three] = await rects('#rtl-arrange [data-part=arrange-bank] [data-word="ثلاثة"]');
  const box = await page.$eval('#rtl-arrange [data-part=arrange-bank] [data-word="ثلاثة"]', (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  // Between the two: left of the first's middle, right of the second's.
  const answerRow = await page.$eval("#rtl-arrange [data-part=arrange-answer]", (n) => { const r = n.getBoundingClientRect(); return { y: r.top + r.height / 2 }; });
  const x = (one.left + one.width / 2 + two.left + two.width / 2) / 2;
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 4, box.y - 4, { steps: 2 });
  await page.mouse.move(x, answerRow.y, { steps: 12 });
  await page.mouse.up();
  await finish();
  const placed = (await rects("#rtl-arrange [data-part=arrange-answer] [data-part=tile]")).map((r) => r.text);
  assert(JSON.stringify(placed) === JSON.stringify(["واحد", "ثلاثة", "اثنان"]), `placed in order: ${placed.join(", ")} (dropped at x ${Math.round(x)}, ${three.text} from the bank)`);
  const after = await rects("#rtl-arrange [data-part=arrange-answer] [data-part=tile]");
  assert(after[0].right > after[1].right && after[1].right > after[2].right, "the three sit right to left");
  return placed.join(" · ");
});

await stage("a wrong order shows the right one in a right-to-left row", async () => {
  await page.click("#rtl-arrange [data-part=button]");
  await finish();
  const key = await page.$eval("#rtl-arrange [data-part=arrange-key]", (n) => n.getAttribute("dir"));
  assert(key === "rtl", `the key's dir is ${key}`);
  const tiles = await rects("#rtl-arrange [data-part=arrange-key] [data-part=tile]");
  assert(tiles[0].text === "واحد" && tiles[0].right > tiles[1].right && tiles[1].right > tiles[2].right, `the key from the right: ${tiles.map((t) => `${t.text} ${Math.round(t.right)}`).join(", ")}`);
  await page.screenshot({ path: join(OUT, "arrange.png"), clip: { x: 0, y: 150, width: 480, height: 420 } });
});

await stage("English tiles in the language's order read left to right inside a right-to-left row", async () => {
  const rows = await page.$$eval("#rtl-arrange-en :is([data-part=arrange-answer], [data-part=arrange-bank])", (nodes) => nodes.map((n) => n.getAttribute("dir")));
  assert(rows.every((d) => d === "rtl"), `rows: ${rows}`);
  const tiles = await rects("#rtl-arrange-en [data-part=arrange-bank] [data-part=tile]");
  assert(tiles.every((t) => t.dir === "ltr"), `tiles: ${tiles.map((t) => `${t.text} ${t.dir}`).join(", ")}`);
  await page.click('#rtl-arrange-en [data-part=arrange-bank] [data-word="I have"]');
  await finish();
  const [placed] = await rects("#rtl-arrange-en [data-part=arrange-answer] [data-part=tile]");
  assert(placed.dir === "ltr", `a placed English tile reads ${placed.dir}`);
});

await stage("Hebrew, Arabic and Urdu read in their own fonts, each downloaded once its letters show", async () => {
  const result = await page.evaluate(async () => {
    const stage = document.getElementById("rtl-stage");
    const lines = [["he", "שלום, מה שלומך?"], ["ar", "مرحبا، كيف حالك؟"], ["ur", "آپ کیسے ہیں؟"]].map(([lang, text]) => {
      const p = window.ui.el("p", { lang, id: `font-${lang}` }, text);
      p.style.fontFamily = "var(--type-read)"; // as the learned language's parts set it
      return p;
    });
    stage.append(...lines);
    lines.forEach((p) => p.getBoundingClientRect());
    await document.fonts.ready;
    return Object.fromEntries(lines.map((p) => [p.lang, getComputedStyle(p).fontFamily]));
  });
  const faces = await notoFaces();
  assert(result.he.startsWith('"Noto Sans Hebrew"') && result.ar.startsWith('"Noto Sans Arabic"') && result.ur.startsWith('"Noto Nastaliq Urdu"'), JSON.stringify(result));
  assert(["Noto Sans Hebrew", "Noto Sans Arabic", "Noto Nastaliq Urdu"].every((f) => faces[f] === "loaded"), JSON.stringify(faces));
  await page.locator("#font-he").screenshot({ path: join(OUT, "font-hebrew.png") });
  await page.locator("#font-ar").screenshot({ path: join(OUT, "font-arabic.png") });
  await page.locator("#font-ur").screenshot({ path: join(OUT, "font-urdu.png") });
  return JSON.stringify(faces);
});

await stage("Armenian and Georgian read in their own fonts, fetched only once their letters show (never for a hyphen in English)", async () => {
  const fetched = [];
  const watch = (request) => /\/fonts\/noto-sans-(armenian|georgian)/.test(request.url()) && fetched.push(request.url());
  page.on("request", watch);
  try {
    // English with the shared characters these fonts also hold (U+2010 hyphen, U+2024 one dot leader, U+0308 combining
    // diaeresis, U+205A two dot punctuation, U+2E31 word separator middle dot, U+25CC dotted circle): the faces' ranges
    // are their scripts' own blocks, so none of these may fetch them, whatever Instrument Sans lacks.
    const before = await page.evaluate(async () => {
      const p = window.ui.el("p", { lang: "en", id: "font-en-hyphen" }, "A well\u2010known na\u0308ive one\u2024two \u205A \u2E31 \u25CC.");
      p.style.fontFamily = "var(--type-read)";
      document.getElementById("rtl-stage").append(p);
      p.getBoundingClientRect();
      await document.fonts.ready;
      return Object.fromEntries([...document.fonts].filter((f) => /Armenian|Georgian/.test(f.family)).map((f) => [f.family.replace(/"/g, ""), f.status]));
    });
    await page.waitForTimeout(600);
    assert(!fetched.length, `English pulled ${fetched.join(", ")}`);
    assert(Object.values(before).length === 2 && Object.values(before).every((s) => s === "unloaded"), JSON.stringify(before));
    const result = await page.evaluate(async () => {
      const lines = [["hy", "Բարև, ինչպե՞ս ես։"], ["ka", "გამარჯობა, როგორ ხარ?"]].map(([lang, text]) => {
        const p = window.ui.el("p", { lang, id: `font-${lang}` }, text);
        p.style.fontFamily = "var(--type-read)";
        return p;
      });
      document.getElementById("rtl-stage").append(...lines);
      lines.forEach((p) => p.getBoundingClientRect());
      await document.fonts.ready;
      return Object.fromEntries(lines.map((p) => [p.lang, getComputedStyle(p).fontFamily]));
    });
    const faces = await notoFaces();
    assert(result.hy.startsWith('"Noto Sans Armenian"') && result.ka.startsWith('"Noto Sans Georgian"'), JSON.stringify(result));
    assert(faces["Noto Sans Armenian"] === "loaded" && faces["Noto Sans Georgian"] === "loaded", JSON.stringify(faces));
    assert(fetched.some((u) => u.includes("armenian")) && fetched.some((u) => u.includes("georgian")), `fetched: ${fetched.join(", ")}`);
    await page.locator("#font-hy").screenshot({ path: join(OUT, "font-armenian.png") });
    await page.locator("#font-ka").screenshot({ path: join(OUT, "font-georgian.png") });
    return `English fetched neither; then ${fetched.length} request(s)`;
  } finally {
    page.off("request", watch);
  }
});

await stage("Devanagari, Gurmukhi and Gujarati read in their own fonts, fetched only once their letters show (never for English, and Punjabi's danda from its own)", async () => {
  const fetched = [];
  const watch = (request) => /\/fonts\/noto-sans-(devanagari|gurmukhi|gujarati)/.test(request.url()) && fetched.push(request.url().replace(/.*\/fonts\//, ""));
  page.on("request", watch);
  const put = (lines) => page.evaluate(async (lines) => {
    const nodes = lines.map(([lang, text]) => {
      const p = window.ui.el("p", { lang, id: `font-${lang}` }, text);
      p.style.fontFamily = "var(--type-read)";
      return p;
    });
    document.getElementById("rtl-stage").append(...nodes);
    nodes.forEach((p) => p.getBoundingClientRect());
    await document.fonts.ready;
    return Object.fromEntries(nodes.map((p) => [p.lang, getComputedStyle(p).fontFamily]));
  }, lines);
  try {
    // English with characters these fonts' own subsets also hold (the rupee sign, the joiners, the dotted circle, a
    // North Indic number form): the faces' ranges are their scripts' own blocks, so none of these may fetch them.
    await put([["en", "Price \u20B920, a\u200Cb\u200Dc \u25CC \uA830."]]);
    await page.waitForTimeout(600);
    assert(!fetched.length, `English pulled ${fetched.join(", ")}`);
    // Punjabi and Gujarati, Punjabi ending in the danda: each its own face, and no Devanagari for the danda.
    const pg = await put([["pa", "ਮੈਂ ਠੀਕ ਹਾਂ।"], ["gu", "તમે કેમ છો?"]]);
    await page.waitForTimeout(600);
    assert(pg.pa.startsWith('"Noto Sans Gurmukhi"') && pg.gu.startsWith('"Noto Sans Gujarati"'), JSON.stringify(pg));
    assert(!fetched.some((u) => u.includes("devanagari")), `Punjabi or Gujarati pulled Devanagari: ${fetched.join(", ")}`);
    // Hindi, Marathi and Nepali share one face, fetched once.
    const deva = await put([["hi", "आप कैसे हैं?"], ["mr", "तुम्ही कसे आहात?"], ["ne", "तपाईंलाई कस्तो छ?"]]);
    await page.waitForTimeout(600);
    assert(["hi", "mr", "ne"].every((lang) => deva[lang].startsWith('"Noto Sans Devanagari"')), JSON.stringify(deva));
    const faces = await notoFaces();
    assert(["Noto Sans Devanagari", "Noto Sans Gurmukhi", "Noto Sans Gujarati"].every((f) => faces[f] === "loaded"), JSON.stringify(faces));
    const count = (name) => fetched.filter((u) => u.includes(name)).length;
    assert(count("devanagari") === 1 && count("gurmukhi") === 1 && count("gujarati") === 1, `fetched: ${fetched.join(", ")}`);
    for (const lang of ["hi", "pa", "gu"]) await page.locator(`#font-${lang}`).screenshot({ path: join(OUT, `font-${lang}.png`) });
    return `English fetched none; then ${fetched.join(", ")}`;
  } finally {
    page.off("request", watch);
  }
});

await stage("Arabic's flag is its script's mark, the size of a flag", async () => {
  const mark = await page.evaluate(async () => {
    const img = window.ui.languageFlag("ar", { label: "Arabic" });
    const big = window.ui.el("img", { src: "/flags/marks/ar.svg", alt: "", id: "mark-large" });
    Object.assign(big.style, { width: "160px", height: "120px" });
    document.getElementById("rtl-stage").append(img, big);
    await Promise.all([img.decode(), big.decode()]);
    const r = img.getBoundingClientRect();
    return { src: img.getAttribute("src"), w: img.naturalWidth, h: img.naturalHeight, shown: [r.width, r.height] };
  });
  assert(mark.src === "/flags/marks/ar.svg" && mark.w === 640 && mark.h === 480, JSON.stringify(mark));
  assert(mark.shown[0] === 20 && mark.shown[1] === 15, `shown at ${mark.shown}`);
  await page.locator("#mark-large").screenshot({ path: join(OUT, "arabic-mark.png") });
});

await stage("a word shows its vowel marks until you know it, then as written, and a tap brings them back", async () => {
  const result = await page.evaluate(async () => {
    const { LANGUAGES } = await import("/js/lang/index.js");
    LANGUAGES.xv = { name: "Vowels test", locale: "xv-XV", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "vowels", patterns: {} };
    const card = window.ui.studyCard({ tags: [], words: [{ text: "ספר" , reading: "סֵפֶר" }, { text: "טוב.", reading: "טוֹב", readingHidden: true }], literal: [{ text: "a book" }, { text: "good" }], english: [0, 1], natural: "A good book." }, { lang: "xv" });
    card.id = "vowels-card";
    document.getElementById("rtl-stage").append(card);
    // What each word shows: the text of its pieces that take up room.
    const shown = () => [...card.querySelectorAll(".lx-word")].map((word) => [...word.querySelectorAll("span")].filter((s) => !s.children.length && s.getClientRects().length).map((s) => s.textContent).join(""));
    const widths = [...card.querySelectorAll(".lx-word")].map((w) => Math.round(w.getBoundingClientRect().width));
    return { before: shown(), widths };
  });
  await page.locator("#vowels-card").screenshot({ path: join(OUT, "vowels-before.png") });
  Object.assign(result, await page.evaluate(() => {
    const card = document.getElementById("vowels-card");
    window.ui.showReading(card);
    const after = [...card.querySelectorAll(".lx-word")].map((word) => [...word.querySelectorAll("span")].filter((s) => !s.children.length && s.getClientRects().length).map((s) => s.textContent).join(""));
    return { after, widthsAfter: [...card.querySelectorAll(".lx-word")].map((w) => Math.round(w.getBoundingClientRect().width)) };
  }));
  await page.locator("#vowels-card").screenshot({ path: join(OUT, "vowels-after.png") });
  await page.evaluate(async () => {
    document.getElementById("vowels-card").remove();
    delete (await import("/js/lang/index.js")).LANGUAGES.xv;
  });
  assert(result.before.length === 2, `words: ${JSON.stringify(result)}`);
  assert(result.before[0] === "סֵפֶר" && result.before[1] === "טוב.", `before a tap: ${JSON.stringify(result.before)}`);
  assert(result.after[1] === "טוֹב.", `after a tap: ${JSON.stringify(result.after)}`);
  assert(Math.abs(result.widths[1] - result.widthsAfter[1]) <= 2, `the word's width moved with its marks: ${result.widths[1]} → ${result.widthsAfter[1]}`);
  return `${result.before.join(" ")} → ${result.after.join(" ")}`;
});

await stage("vowel marks above and below the letters stay inside their tile and their card", async () => {
  const result = await page.evaluate(async () => {
    const { LANGUAGES } = await import("/js/lang/index.js");
    LANGUAGES.xv = { name: "Vowels test", locale: "xv-XV", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "vowels", patterns: {} };
    // Points below (שׁוּלְחָן, בְּבַקָּשָׁה) and Arabic's kasra and shadda (جِدًّا), the deepest and tallest marks.
    const words = [{ text: "שולחן", reading: "שׁוּלְחָן" }, { text: "בבקשה", reading: "בְּבַקָּשָׁה" }, { text: "ישנים", reading: "יְשֵׁנִים" }, { text: "جداً", reading: "جِدًّا" }];
    const holder = window.ui.el("div", { id: "vowels-parts" });
    const game = window.ui.arrange(words, words, { lang: "xv", order: "xv" });
    const card = window.ui.studyCard({ tags: [], words, literal: [{ text: "a table" }, { text: "please" }, { text: "asleep" }, { text: "very" }], english: [0, 1, 2, 3], natural: "x" }, { lang: "xv" });
    holder.append(game, card);
    document.getElementById("rtl-stage").append(holder);
    await document.fonts.ready;
    const canvas = document.createElement("canvas").getContext("2d");
    const out = [];
    for (const reading of holder.querySelectorAll('[data-part="reading"][data-variant="vowels"]')) {
      if (!reading.getClientRects().length) continue;
      const owner = reading.closest('[data-part="tile"], [data-part="study-card"]');
      // The baseline: an empty inline-block's bottom sits on it.
      const probe = document.createElement("span");
      Object.assign(probe.style, { display: "inline-block", width: "0", height: "0" });
      reading.after(probe);
      const baseline = probe.getBoundingClientRect().bottom;
      probe.remove();
      const style = getComputedStyle(reading);
      canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ink = canvas.measureText(reading.textContent);
      const box = owner.getBoundingClientRect();
      out.push({ part: owner.dataset.part, word: reading.textContent, above: Math.round(box.top - (baseline - ink.actualBoundingBoxAscent)), below: Math.round(box.bottom - (baseline + ink.actualBoundingBoxDescent)) });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return out;
  });
  await page.locator("#vowels-parts").screenshot({ path: join(OUT, "vowels-parts.png") });
  await page.evaluate(async () => {
    document.getElementById("vowels-parts").remove();
    delete (await import("/js/lang/index.js")).LANGUAGES.xv;
  });
  const tiles = result.filter((r) => r.part === "tile");
  assert(tiles.length >= 4 && result.some((r) => r.part === "study-card"), `measured: ${JSON.stringify(result)}`);
  // above: the box's top less the ink's (≤ 0 is inside); below: the box's bottom less the ink's (≥ 0 is inside).
  const out = result.filter((r) => r.above > 0 || r.below < 0);
  assert(!out.length, `marks outside their part: ${JSON.stringify(out)}`);
  return tiles.map((r) => `${r.word} ${r.above}/${r.below}`).join(", ");
});

await stage("Hebrew listed inside English (a chip, a gloss) keeps its own order", async () => {
  const result = await page.evaluate(() => {
    const tag = window.ui.conceptTag("There is, and having: יש, אין", "new");
    const grid = window.ui.matchGrid([["ספר", "you, to a man (אתם, אתן: you all)"]], { lang: "xr" });
    const holder = window.ui.el("div", { id: "bidi-lists" }, tag, grid);
    document.getElementById("rtl-stage").append(holder);
    // Where each quoted word sits on the line: the first quoted must be left of the second.
    const at = (root, word) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const i = node.textContent.indexOf(word);
        if (i < 0) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + word.length);
        const r = range.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top) };
      }
      return null;
    };
    const en = grid.querySelector('[data-side="en"]');
    const out = { tag: [at(tag, "יש"), at(tag, "אין")], gloss: [at(en, "אתם"), at(en, "אתן")] };
    holder.remove();
    return out;
  });
  // In reading order: on an earlier line, or left of the other on the same line (a narrow button wraps).
  const before = ([a, b]) => a.top < b.top - 4 || (Math.abs(a.top - b.top) <= 4 && a.left < b.left);
  assert(before(result.tag), `the chip's יש, אין: ${JSON.stringify(result.tag)} (יש should come first)`);
  assert(before(result.gloss), `the gloss's אתם, אתן: ${JSON.stringify(result.gloss)} (אתם should come first)`);
  return JSON.stringify(result);
});

await stage("a quoted right-to-left run in a chip or a gloss stays on one line, and the longest fits a Match tile on a phone", async () => {
  const result = await page.evaluate(async () => {
    const holder = window.ui.el("div", {});
    document.getElementById("rtl-stage").append(holder);
    const settled = async (node) => {
      node.getBoundingClientRect();
      await document.fonts.ready;
    };
    // The lines an inline run sits on, and the run holding Pashto's پٙه … کې (a summary chip's gloss, 28 Oct).
    const lines = (node) => new Set([...node.getClientRects()].map((r) => Math.round(r.top))).size;
    const runOf = (root) => [...root.querySelectorAll("bdi")].find((bdi) => bdi.textContent.includes("کې"));
    const gloss = "in, on, at; begins phrases such as پٙه … کې";
    const split = { chip: [], gloss: [] };
    for (let width = 200; width <= 340; width += 4) {
      holder.style.width = `${width}px`;
      const tag = window.ui.conceptTag(["په", ` · ${gloss}`], "new");
      const grid = window.ui.matchGrid([["په", gloss]], { lang: "xr" });
      holder.replaceChildren(tag, grid);
      await settled(holder);
      if (lines(runOf(tag)) > 1) split.chip.push(width);
      if (lines(runOf(grid.querySelector('[data-side="en"]'))) > 1) split.gloss.push(width);
    }
    // A phone's column (375 wide, 16 px gutters): the longest quoted run in any pack (Arabic's) inside its Match tile.
    holder.style.width = "343px";
    const grid = window.ui.matchGrid([["عُطْلَة", "time off (عُطْلَةُ نِهَايَةِ الْأُسْبُوعِ: the weekend)"]], { lang: "xr" });
    holder.replaceChildren(grid);
    await settled(holder);
    const tile = grid.querySelector('[data-side="en"]');
    const box = tile.getBoundingClientRect();
    const style = getComputedStyle(tile);
    const inner = [box.left + parseFloat(style.paddingLeft), box.right - parseFloat(style.paddingRight)].map(Math.round);
    const run = tile.querySelector("bdi").getBoundingClientRect();
    holder.remove();
    return { split, fit: { tile: inner, run: [Math.round(run.left), Math.round(run.right)] } };
  });
  assert(!result.split.chip.length, `the chip's پٙه … کې breaks across lines at ${result.split.chip.join(", ")} px wide`);
  assert(!result.split.gloss.length, `the gloss's پٙه … کې breaks across lines at ${result.split.gloss.join(", ")} px wide`);
  const { tile, run } = result.fit;
  assert(run[0] >= tile[0] && run[1] <= tile[1], `the longest quoted run spills out of its Match tile: run ${run}, tile ${tile}`);
  return JSON.stringify(result.fit);
});

await stage("Choose's sentences start at the right, and a wrong mark sits in the tile's end corner, its left", async () => {
  const result = await page.evaluate(() => {
    const list = window.ui.choiceList(["أنا هنا الآن", "هو هناك"], 0, { lang: "xr" });
    document.getElementById("rtl-stage").append(list);
    const choice = list.firstElementChild;
    const wrong = document.querySelector('#rtl-arrange [data-part=tile][data-state="wrong"]');
    const after = getComputedStyle(wrong, "::after");
    return { align: getComputedStyle(choice).textAlign, dir: getComputedStyle(choice).direction, markPosition: after.position, markLeft: after.left };
  });
  assert(result.dir === "rtl" && result.align === "start", `Choose: ${result.dir}, ${result.align}`);
  assert(result.markPosition === "absolute" && result.markLeft === "4px", `the wrong mark: ${result.markPosition}, left ${result.markLeft}`);
});

await stage("Fill's choices start at the right and run right to left", async () => {
  const result = await page.evaluate(() => {
    const game = window.ui.fillSentence(["سوف"], ["إلى", "البيت."], ["أذهب", "ذهبت", "يذهبون"], "أذهب", { lang: "xr" });
    document.getElementById("rtl-stage").append(game);
    const row = game.lastElementChild;
    const box = row.getBoundingClientRect();
    const choices = [...row.children].map((n) => n.getBoundingClientRect());
    return { dir: getComputedStyle(row).direction, rowRight: box.right, rights: choices.map((r) => r.right), lefts: choices.map((r) => r.left) };
  });
  assert(result.dir === "rtl", `the choices' row is ${result.dir}`);
  assert(near(result.rights[0], result.rowRight, 2), `the first choice ends at ${result.rights[0]}, the row at ${result.rowRight}`);
  assert(result.rights.every((r, i) => i === 0 || r <= result.lefts[i - 1] + 1), `each choice sits left of the one before: ${JSON.stringify(result)}`);
  return `first at the right edge (${Math.round(result.rights[0])}), then leftward`;
});

await stage("Fill's choices show their vowel marks while the word is new, as written once it's known, and land as shown", async () => {
  const result = await page.evaluate(async () => {
    const { LANGUAGES } = await import("/js/lang/index.js");
    LANGUAGES.xv = { name: "Vowels test", locale: "xv-XV", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "vowels", patterns: {} };
    const options = (hidden) => [{ text: "שותה", reading: "שׁוֹתֶה", hidden }, { text: "שתה", reading: "שָׁתָה", hidden }];
    let answer = null;
    const fresh = window.ui.fillSentence(["אני"], ["קפה."], options(false), "שותה", { lang: "xv", onAnswer: (a) => (answer = a) });
    const known = window.ui.fillSentence(["אני"], ["קפה."], options(true), "שותה", { lang: "xv" });
    document.getElementById("rtl-stage").append(fresh, known);
    // What a node shows: the text of its pieces that take up room.
    const shown = (node) => [...node.querySelectorAll("span")].filter((s) => !s.children.length && s.getClientRects().length).map((s) => s.textContent).join("") || node.textContent;
    const choices = (game) => [...game.lastElementChild.children];
    const out = {
      fresh: choices(fresh).map(shown),
      known: choices(known).map(shown),
      words: choices(fresh).map((c) => c.dataset.word),
    };
    choices(fresh)[0].click();
    out.blank = shown(fresh.querySelector('[data-part="blank"]'));
    out.answer = answer;
    fresh.remove();
    known.remove();
    delete LANGUAGES.xv;
    return out;
  });
  assert(JSON.stringify(result.fresh) === JSON.stringify(["שׁוֹתֶה", "שָׁתָה"]), `a new word's choices show ${JSON.stringify(result.fresh)}`);
  assert(JSON.stringify(result.known) === JSON.stringify(["שותה", "שתה"]), `a known word's choices show ${JSON.stringify(result.known)}`);
  assert(JSON.stringify(result.words) === JSON.stringify(["שותה", "שתה"]), `the choices' words: ${JSON.stringify(result.words)}`);
  assert(result.blank === "שׁוֹתֶה", `the gap shows ${JSON.stringify(result.blank)}`);
  assert(result.answer?.correct === true && result.answer?.picked === "שותה", `the answer: ${JSON.stringify(result.answer)}`);
  return `${result.fresh.join(", ")} → ${result.known.join(", ")}; picked ${result.answer.picked}`;
});


await stage("a Hebrew-script word's romanization sits over it, centered, its punctuation outside (Yiddish's roman readings)", async () => {
  const result = await page.evaluate(async () => {
    const { LANGUAGES } = await import("/js/lang/index.js");
    LANGUAGES.xy = { name: "Roman test", locale: "xy", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "roman", patterns: {} };
    const words = [{ text: "שבת", reading: "shabes" }, { text: "עסן" }, { text: "מיר" }, { text: "חלה.", reading: "khale" }];
    const card = window.ui.studyCard({ tags: [], words, literal: [{ text: "On Shabbat" }, { text: "eat" }, { text: "we" }, { text: "challah" }], english: [2, 1, 3, 0], natural: "On Shabbat we eat challah." }, { lang: "xy" });
    const game = window.ui.arrange(words.map((w) => ({ ...w, text: w.text.replace(".", "") })), words.map((w) => ({ ...w, text: w.text.replace(".", "") })), { lang: "xy", order: "xy" });
    const holder = window.ui.el("div", { id: "roman-stage" }, card, game);
    document.getElementById("rtl-stage").append(holder);
    await new Promise((r) => setTimeout(r, 300));
    // Each reading against the letters it stands over: a range over the base's own text, never the reading's.
    const over = (root) => [...root.querySelectorAll("rt")].map((rt) => {
      const base = rt.closest("ruby");
      const text = [...base.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("");
      const range = document.createRange();
      range.selectNodeContents(base.firstChild);
      const b = range.getBoundingClientRect();
      const r = rt.getBoundingClientRect();
      return { reading: rt.textContent.replace(/\u2060/g, ""), base: text, gap: Math.round(b.top - r.bottom), center: Math.round((r.left + r.right) / 2 - (b.left + b.right) / 2) };
    });
    const out = { card: over(card), tiles: over(game) };
    holder.remove();
    delete LANGUAGES.xy;
    return out;
  });
  for (const where of ["card", "tiles"]) {
    const rows = result[where];
    assert(rows.length === 2 && rows.map((r) => r.reading).join(",") === "shabes,khale", `${where}: readings ${JSON.stringify(rows)}`);
    assert(rows.every((r) => !r.base.includes(".")), `${where}: punctuation inside a reading's base: ${JSON.stringify(rows)}`);
    assert(rows.every((r) => r.gap >= -6 && Math.abs(r.center) <= 2), `${where}: a reading not over its word: ${JSON.stringify(rows)}`);
  }
  return JSON.stringify(result);
});

// ---------- the reader ----------

// A right-to-left book of the test language, long enough for several pages; mounted as /design mounts its readers.
const RTL_WORDS = ["كان", "الولد", "يقرأ", "كتابا", "في", "البيت", "كل", "يوم", "مع", "أمه", "وأبيه", "بعد", "المدرسة", "ثم", "ينام"];
await page.setViewportSize({ width: 1260, height: 1100 });
await page.evaluate(async (vocab) => {
  const { parseText } = await import("/js/read/import-text.js");
  const { openReader } = await import("/js/read/reader.js");
  const sentences = [];
  for (let k = 0; k < 160; k++) sentences.push(`${Array.from({ length: 7 }, (_, j) => vocab[(k * 3 + j * 5) % vocab.length]).join(" ")}.`);
  const paras = [];
  for (let k = 0; k < sentences.length; k += 8) paras.push(sentences.slice(k, k + 8).join(" "));
  const book = parseText(paras.join("\n\n"), { title: "كتاب", lang: "xr" });
  book.lang = "xr";
  window.rtlBook = book;
  const holder = window.ui.el("div", { id: "rtl-readers" });
  Object.assign(holder.style, { position: "fixed", inset: "0", zIndex: "100000", background: "var(--surface, #000)", display: "flex", flexWrap: "wrap", gap: "24px", padding: "24px", alignItems: "flex-start", alignContent: "flex-start" });
  const frame = (id, w, h) => {
    const node = window.ui.el("div", { id, class: "ds-reader-frame" });
    Object.assign(node.style, { width: `${w}px`, maxWidth: "none", height: `${h}px`, flex: "none" });
    holder.append(node);
    return node;
  };
  document.body.append(holder);
  window.rtlPaged = openReader(frame("rtl-paged", 360, 620), { book, word: 0, mode: "pages" });
  window.rtlPaged.setZen(true);
  // Two pages side by side need a frame wider than tall and at least 700 px wide, as a landscape screen is.
  window.rtlSpread = openReader(frame("rtl-spread", 780, 440), { book, word: 0, mode: "pages" });
  window.rtlSpread.setZen(true);
}, RTL_WORDS);
await page.waitForSelector("#rtl-paged [data-ready]", { state: "attached" }).catch(() => {});
await page.waitForTimeout(600);
const status = (id) => page.$eval(`#${id} [data-part="reader-status"]`, (n) => n.textContent);
const pageNumber = async (id) => Number((await status(id)).split("/")[0]);
const settle = () => page.waitForTimeout(900);

await stage("a right-to-left book's page runs right to left", async () => {
  const result = await page.evaluate(() => {
    const text = document.querySelector('#rtl-paged [data-part="reader-text"]');
    const words = [...text.querySelectorAll(".lx-w[data-i]")].filter((w) => !w.hidden).slice(0, 3).map((w) => w.getBoundingClientRect());
    return { dir: text.getAttribute("dir"), computed: getComputedStyle(text).direction, rights: words.map((r) => Math.round(r.right)), tops: words.map((r) => Math.round(r.top)) };
  });
  assert(result.dir === "rtl" && result.computed === "rtl", `the page is ${result.dir}, ${result.computed}`);
  assert(result.tops[0] === result.tops[1] && result.rights[0] > result.rights[1] && result.rights[1] > result.rights[2], `the first words from the right: ${result.rights} (tops ${result.tops})`);
  return `pages: ${await status("rtl-paged")}`;
});

await stage("the bars' chevron sits top left, over the end of the first line, clear of the first word", async () => {
  const result = await page.evaluate(() => {
    const root = document.querySelector('#rtl-paged [data-part="reader"]');
    const box = root.getBoundingClientRect();
    const chevron = root.querySelector(':scope > [data-part="reader-collapse"]').getBoundingClientRect();
    const first = [...root.querySelectorAll('[data-part="reader-text"] .lx-w[data-i]')].find((w) => !w.hidden && w.getBoundingClientRect().width > 0).getBoundingClientRect();
    const overlap = chevron.left < first.right && first.left < chevron.right && chevron.top < first.bottom && first.top < chevron.bottom;
    return { rtl: root.hasAttribute("data-rtl"), fromLeft: Math.round(chevron.left - box.left), fromRight: Math.round(box.right - chevron.right), overlap };
  });
  assert(result.rtl, "the reader has no data-rtl");
  assert(result.fromLeft < result.fromRight && result.fromLeft <= 24, `the chevron is ${result.fromLeft}px from the left, ${result.fromRight}px from the right`);
  assert(!result.overlap, "the chevron covers the first word");
  return `${result.fromLeft}px from the left`;
});

await stage("it turns right to left: a tap on the left goes on, on the right goes back; the left arrow goes on", async () => {
  const box = await page.$eval("#rtl-paged", (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const at = (fx) => page.mouse.click(box.x + box.w * fx, box.y + box.h / 2);
  const start = await pageNumber("rtl-paged");
  await at(0.15);
  await settle();
  const afterLeft = await pageNumber("rtl-paged");
  await at(0.85);
  await settle();
  const afterRight = await pageNumber("rtl-paged");
  await page.keyboard.press("ArrowLeft");
  await settle();
  const afterKey = await pageNumber("rtl-paged");
  await page.keyboard.press("ArrowRight");
  await settle();
  const backKey = await pageNumber("rtl-paged");
  assert(afterLeft === start + 1 && afterRight === start && afterKey === start + 1 && backKey === start, `pages: ${start} → left tap ${afterLeft} → right tap ${afterRight} → ArrowLeft ${afterKey} → ArrowRight ${backKey}`);
  return `${start} → ${afterLeft} → ${afterRight} → ${afterKey} → ${backKey}`;
});

await stage("a drag to the right turns on, its page peeling from the left edge", async () => {
  const box = await page.$eval("#rtl-paged", (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const start = await pageNumber("rtl-paged");
  const y = box.y + box.h / 2;
  await page.mouse.move(box.x + box.w * 0.1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.2, y, { steps: 3 });
  await page.mouse.move(box.x + box.w * 0.45, y, { steps: 6 });
  // Mid-drag: the turning sheet's front is cut along a fold, and the part it shows is on the right (its left edge is folded over).
  const mid = await page.evaluate(() => {
    const front = document.querySelector("#rtl-paged .lx-turn-front");
    return front ? getComputedStyle(front).clipPath : null;
  });
  await page.mouse.move(box.x + box.w * 0.9, y, { steps: 8 });
  await page.mouse.up();
  await settle();
  const after = await pageNumber("rtl-paged");
  assert(after === start + 1, `a drag to the right: page ${start} → ${after}`);
  assert(mid && mid.startsWith("polygon("), `the sheet mid-drag: ${mid}`);
  // The polygon keeps the page's right edge (x = width) whole: the fold is on the left.
  const xs = [...mid.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => Number(m[1]));
  const W = await page.$eval("#rtl-paged", (n) => n.firstElementChild.getBoundingClientRect().width);
  assert(Math.max(...xs) >= W - 1 && Math.min(...xs) > 1, `the front keeps the right edge (${W.toFixed(0)}), folded on the left: x from ${Math.min(...xs).toFixed(0)} to ${Math.max(...xs).toFixed(0)}`);
  await page.keyboard.press("ArrowRight");
  await settle();
  return `page ${start} → ${after}`;
});

await stage("a held run copies in reading order", async () => {
  const copied = await page.evaluate(() => {
    window.copiedText = null;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedText = text; } } });
    const words = [...document.querySelectorAll('#rtl-paged [data-part="reader-text"] .lx-w[data-i]')].filter((w) => !w.hidden && w.getBoundingClientRect().width > 0);
    const at = (w) => { const r = w.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, i: Number(w.dataset.i) }; };
    // From the first word (top right, clear of the chevron, which sits top left here) to the third.
    return [at(words[0]), at(words[2])];
  });
  // Hold the first word still (a hold selects it), then drag the selection's end handle to the third word.
  await page.mouse.move(copied[0].x, copied[0].y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const handle = await page.$eval('#rtl-paged [data-part="reader-handle"][data-variant="end"]', (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(copied[1].x, copied[1].y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.locator('#rtl-paged [data-part="reader-hold"] button', { hasText: "Copy" }).click();
  const text = await page.evaluate(() => window.copiedText);
  const want = await page.evaluate(([a, b]) => window.rtlBook.words.slice(a, b + 1).join(" "), [copied[0].i, copied[1].i]);
  assert(text === want, `copied ${JSON.stringify(text)}, want ${JSON.stringify(want)}`);
  return text;
});

await stage("a spread's first page is on the right, and the left arrow shows the next spread", async () => {
  const halves = () => page.evaluate(() => {
    const text = document.querySelector('#rtl-spread [data-part="reader-text"]');
    const box = text.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    const seen = { right: [], left: [] };
    for (const w of text.querySelectorAll(".lx-w[data-i]")) {
      if (w.hidden) continue;
      const r = w.getBoundingClientRect();
      if (!r.width || r.right < box.left || r.left > box.right) continue;
      (r.left + r.width / 2 > mid ? seen.right : seen.left).push(Number(w.dataset.i));
    }
    return { variant: document.querySelector("#rtl-spread [data-part=reader]")?.getAttribute("data-variant") ?? document.querySelector("#rtl-spread [data-variant]")?.getAttribute("data-variant"), right: [Math.min(...seen.right), Math.max(...seen.right)], left: [Math.min(...seen.left), Math.max(...seen.left)] };
  });
  const first = await halves();
  assert(first.right[0] < first.left[0] && first.right[1] < first.left[0], `first spread: right page words ${first.right}, left page ${first.left}`);
  await page.keyboard.press("ArrowLeft");
  await settle();
  const next = await halves();
  assert(next.right[0] === first.left[1] + 1, `the next spread starts where the first ended: right page ${next.right}, the first's left page ended at ${first.left[1]}`);
  await page.locator("#rtl-spread").screenshot({ path: join(OUT, "reader-spread.png") });
  await page.locator("#rtl-paged").screenshot({ path: join(OUT, "reader-page.png") });
  return `first: right ${first.right}, left ${first.left}; next: right ${next.right}`;
});

await stage("right-to-left words woven into an English book keep the space after them on the line", async () => {
  const result = await page.evaluate(async () => {
    const { parseText } = await import("/js/read/import-text.js");
    const { openReader } = await import("/js/read/reader.js");
    const book = parseText("The cat sat on the mat. The dog ran to the cat.", { title: "Cat" });
    const words = book.words;
    // Each sentence has words to learn you don't know yet (sat, mat, ran), so it stays in English order with the
    // known ones woven in, rather than flipping whole.
    const lemma = { cat: ["قطة", "qitta"], dog: ["كلب", "kalb"], sat: ["جلس", "jalasa"], mat: ["حصيرة", "hasira"], ran: ["ركض", "rakada"] };
    const t = (from, to) => words.slice(from, to).map((w) => lemma[w.toLowerCase().replace(/\W/g, "")] ?? [w, null]);
    const ends = [words.findIndex((w) => w.endsWith(".")) + 1, words.length];
    const weave = { format: "lexicommons-weave", kind: "weave", from: "en", to: "xr", sentences: [{ s: 0, e: ends[0], t: t(0, ends[0]), text: "x", m: [] }, { s: ends[0], e: ends[1], t: t(ends[0], ends[1]), text: "x", m: [] }] };
    const node = window.ui.el("div", { id: "rtl-weave", class: "ds-reader-frame" });
    Object.assign(node.style, { width: "360px", maxWidth: "none", height: "300px", flex: "none" });
    document.getElementById("rtl-readers").append(node);
    openReader(node, { book, word: 0, mode: "scroll", weave, know: new Set(["qitta", "kalb"]) }).setZen(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const woven = [...node.querySelectorAll('[data-part="woven-word"]')];
    return woven.map((span) => {
      const next = span.nextSibling;
      const after = span.nextElementSibling;
      const a = span.getBoundingClientRect();
      const b = after?.getBoundingClientRect();
      return { text: span.textContent, dir: span.getAttribute("dir"), gapOutside: next?.nodeType === 3 ? next.textContent : null, space: b && Math.abs(b.top - a.top) < 4 ? Math.round(b.left - a.right) : null };
    });
  });
  assert(result.length === 3, `woven words: ${JSON.stringify(result)}`);
  for (const w of result) {
    assert(w.dir === "rtl" && !/\s$/.test(w.text), `a woven word: ${JSON.stringify(w)}`);
    assert(w.gapOutside === " ", `the space after ${w.text} is outside it: ${JSON.stringify(w)}`);
    if (w.space != null) assert(w.space >= 2, `a visible space after ${w.text}: ${w.space}px`);
  }
  await page.locator("#rtl-weave").screenshot({ path: join(OUT, "reader-weave.png") });
  return result.map((w) => `${w.text} +${w.space}px`).join(", ");
});

await stage("English words woven into a right-to-left book are their own isolates, the space after them outside", async () => {
  const result = await page.evaluate(async () => {
    const { parseText } = await import("/js/read/import-text.js");
    const { openReader } = await import("/js/read/reader.js");
    const book = parseText("كان الولد يقرأ كتابا في البيت. ثم ينام الولد بعد المدرسة.", { title: "الولد", lang: "xr" });
    book.lang = "xr";
    const words = book.words;
    // Each sentence keeps words to learn (reads, house, sleeps, school), so it stays in the book's order.
    const lemma = { "الولد": ["boy", "boy"], "كتابا": ["book", "book"], "يقرأ": ["reads", "read"], "البيت": ["house", "house"], "ينام": ["sleeps", "sleep"], "المدرسة": ["school", "school"] };
    const t = (from, to) => words.slice(from, to).map((w) => lemma[w.replace(/[.]/g, "")] ?? [w, null]);
    const ends = [words.findIndex((w) => w.endsWith(".")) + 1, words.length];
    const weave = { format: "lexicommons-weave", kind: "weave", from: "xr", to: "en", sentences: [{ s: 0, e: ends[0], t: t(0, ends[0]), text: "x", m: [] }, { s: ends[0], e: ends[1], t: t(ends[0], ends[1]), text: "x", m: [] }] };
    const node = window.ui.el("div", { id: "rtl-weave-back", class: "ds-reader-frame" });
    Object.assign(node.style, { width: "360px", maxWidth: "none", height: "300px", flex: "none" });
    document.getElementById("rtl-readers").append(node);
    openReader(node, { book, word: 0, mode: "scroll", weave, know: new Set(["boy", "book"]) }).setZen(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [...node.querySelectorAll('[data-part="woven-word"]')].map((span) => {
      const next = span.nextSibling;
      const after = span.nextElementSibling;
      const a = span.getBoundingClientRect();
      const b = after?.getBoundingClientRect();
      return { text: span.textContent, dir: span.getAttribute("dir"), gapOutside: next?.nodeType === 3 ? next.textContent : null, space: b && Math.abs(b.top - a.top) < 4 ? Math.round(a.left - b.right) : null };
    });
  });
  assert(result.length >= 2, `woven words: ${JSON.stringify(result)}`);
  for (const w of result) {
    assert(w.dir === "ltr" && !/\s$/.test(w.text), `a woven word: ${JSON.stringify(w)}`);
    assert(w.gapOutside === " ", `the space after ${w.text} is outside it: ${JSON.stringify(w)}`);
    if (w.space != null) assert(w.space >= 2, `a visible space after ${w.text}: ${w.space}px`);
  }
  await page.locator("#rtl-weave-back").screenshot({ path: join(OUT, "reader-weave-rtl-book.png") });
  return result.map((w) => `${w.text} +${w.space}px`).join(", ");
});

await stage("a translation beside the book runs its own way: English under a right-to-left book from the left, a right-to-left one under an English book from the right", async () => {
  const result = await page.evaluate(async () => {
    const { openReader } = await import("/js/read/reader.js");
    const { parseText } = await import("/js/read/import-text.js");
    const holder = document.getElementById("rtl-readers");
    const frame = (id) => {
      const node = window.ui.el("div", { id, class: "ds-reader-frame" });
      Object.assign(node.style, { width: "360px", maxWidth: "none", height: "620px", flex: "none" });
      holder.append(node);
      return node;
    };
    const beside = (book, to, line) => ({ kind: "parallel", to, sentences: book.sentences.map((_, x) => (x < 2 ? line : null)), pages: [] });
    const english = "One elephant is going to drink water.";
    const arabic = "كان الولد يقرأ كتابا.";
    window.rtlBeside = openReader(frame("rtl-beside"), { book: window.rtlBook, word: 0, mode: "pages", weave: beside(window.rtlBook, "en", english) });
    const ltrBook = parseText("The boy reads a book at home every day. Then he sleeps. He wakes up early.", { title: "A book", lang: "en" });
    window.ltrBeside = openReader(frame("ltr-beside"), { book: ltrBook, word: 0, mode: "pages", weave: beside(ltrBook, "xr", arabic) });
    await new Promise((done) => setTimeout(done, 900));
    const read = (id) => {
      const line = document.querySelector(`#${id} [data-part="reader-parallel"]`);
      if (!line) return null;
      const box = line.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(line);
      const words = range.getBoundingClientRect();
      // Where its last mark is drawn: at the end of its own direction.
      const mark = document.createRange();
      mark.setStart(line.firstChild, line.textContent.length - 1);
      mark.setEnd(line.firstChild, line.textContent.length);
      const dot = mark.getBoundingClientRect();
      return { dir: line.getAttribute("dir"), computed: getComputedStyle(line).direction, fromLeft: Math.round(words.left - box.left), fromRight: Math.round(box.right - words.right), markAtRight: dot.left >= words.left + words.width / 2 };
    };
    // The control: the same English with no dir of its own, in the right-to-left page, takes the page's direction.
    const text = document.querySelector('#rtl-beside [data-part="reader-text"]');
    const planted = Object.assign(document.createElement("p"), { textContent: english });
    planted.setAttribute("data-part", "reader-parallel");
    planted.setAttribute("lang", "en");
    planted.id = "planted-beside";
    text.append(planted);
    const control = getComputedStyle(planted).direction;
    planted.remove();
    return { under: read("rtl-beside"), over: read("ltr-beside"), control };
  });
  assert(result.control === "rtl", `the control: a line with no dir in a right-to-left page should take its direction, and was ${result.control}`);
  assert(result.under, "no translation beside the right-to-left book");
  assert(result.under.dir === "ltr" && result.under.computed === "ltr" && result.under.markAtRight && result.under.fromLeft <= 1, `English under a right-to-left book: ${JSON.stringify(result.under)}`);
  assert(result.over, "no translation beside the English book");
  assert(result.over.dir === "rtl" && result.over.computed === "rtl" && !result.over.markAtRight && result.over.fromRight <= 1, `a right-to-left translation under an English book: ${JSON.stringify(result.over)}`);
  return `English: dir ${result.under.dir}, its full stop at its right end; the other way: dir ${result.over.dir}, its full stop at its left end; with no dir it would run ${result.control}`;
});

await stage("in a left-to-right book the chevron stays top right", async () => {
  const result = await page.evaluate(() => {
    const root = document.querySelector('#rtl-weave [data-part="reader"]');
    const box = root.getBoundingClientRect();
    const chevron = root.querySelector(':scope > [data-part="reader-collapse"]').getBoundingClientRect();
    return { rtl: root.hasAttribute("data-rtl"), fromLeft: Math.round(chevron.left - box.left), fromRight: Math.round(box.right - chevron.right) };
  });
  assert(!result.rtl, "an English book's reader has data-rtl");
  assert(result.fromRight < result.fromLeft && result.fromRight <= 24, `the chevron is ${result.fromRight}px from the right, ${result.fromLeft}px from the left`);
  return `${result.fromRight}px from the right`;
});

await page.evaluate(() => document.getElementById("rtl-readers")?.remove());

await stage("no page errors", async () => {
  assert(!errors.length, errors.join(" | "));
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
