// The reader with Japanese and Chinese (B4), in Chrome on a phone, muted: "The Bakery on the Corner" woven into Japanese
// and Chinese (demo-sample.js) kept on the device as a book of yours, and a Japanese book with English help (the first
// sentence of ごんぎつね). Words in your bank, one just added, and Study evidence that makes some known by reading.
//   - English order: a woven word's reading over its kanji, hidden (in place) once you know it by reading; a just-added
//     word's English under it, with no underline; spaces around it as an English word's.
//   - Japanese order and a whole sentence: words run together with <wbr> between, none broken across lines; English
//     among them with English marks; the literal line with English marks and no moved marks.
//   - A tap: the hidden reading shows again, and the popover gives it.
//   - The underline switch (lex-reader's): off takes the dotted line off woven words, in a Japanese line too; on again.
//   - Lines leave room for readings (data-readings).
//   - The text size: 24px by default in a book woven into Japanese, the same with the weave off; a size you pick stays.
//   - Chinese: pinyin over the characters, a whole sentence run together.
//   - A Japanese book with help: a word you don't know with its reading over it and its English under it; names and
//     particles neither; in place, its English with English marks and a narrow gap; no word past the text's edge.
//   - Vowel marks (test Latin and Hebrew registered in the page): on the word itself, as written once known by reading,
//     back on a tap; right to left for Hebrew; a Latin book with help, its English over its words.
// It signs up a test account and deletes it at the end, so it takes a local server only. Headless Chrome, so through the
// channel's parallel lane, from the channel repo root:
//
//   python3 pipelines/lyric-video/tools/gpu.py run --who <you> --label "b4 check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/b4-check.mjs http://localhost:<port> <outDir>
//
// The pages come from the server; the browser from quiet-browser.mjs beside this script (a copy's own when run there).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const [BASE, outArg] = args;
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !outArg) {
  console.error("usage: b4-check.mjs http://localhost:<port> <outDir> [--app <app dir>] (it creates and deletes an account)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
const { chromium } = await import("./quiet-browser.mjs");

const results = [];
const problems = [];
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()} ${m.location()?.url ?? ""}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
const READER = '[data-part="reader"]:not([data-ghost])';
let shots = 61;
// A still with the reader's bars hidden (they cover the page's top), its text from the top.
async function shot(name) {
  if ((await page.locator(READER).getAttribute("data-state")) !== "zen") await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "shots", `${shots++}-${name}.png`) });
}

// The device: the language you learn, your words (one just added at its place in the book), your reader settings, and
// Study evidence from past days for the words you know by reading.
async function setUp({ lang, bank = [], just = null, readKnown = [], weavePrefs = {}, book = "bakery" }) {
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  const set = await page.evaluate(
    async ({ lang, bank, just, readKnown, weavePrefs, book }) => {
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang, from: "en" }));
      const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
      prefs.weave = { ...(prefs.weave ?? {}), [lang]: weavePrefs };
      localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
      const store = await import("/js/read/store.js");
      const fmt = await import("/js/read/book-format.js");
      let id;
      if (book === "bakery") {
        const { demoChecked } = await import("/js/read/demo-sample.js");
        const { book: text, weave } = await demoChecked(lang);
        await store.addBook(text, { [lang]: weave });
        id = text.id;
      } else {
        // ごんぎつね's first sentence (Niimi Nankichi, 1932), its words fixed as written, with English help.
        const words = ["これ", "は、", "私", "が", "小さい", "とき", "に、", "村", "の", "茂平", "という", "おじいさん", "から", "きいた", "お話", "です。"];
        const paras = [{ k: "p", s: 0, e: words.length }];
        const text = { id: "fixture-gon", title: "ごんぎつね", authors: [{ name: "新美南吉" }], lang: "ja", source: { kind: "paste" }, words, paras, italic: [], chapters: [], sentences: fmt.segmentSentences(words, paras, "ja") };
        text.version = await fmt.bookVersion(text);
        const t = [["this", "これ"], ["(topic)、", null], ["I", "私", "わたし"], ["(subject)", null], ["small", "小さい", "ちいさい"], ["when", "とき"], ["at、", null], ["village", "村", "むら"], ["of", "の"], ["Mohei", null], ["called", "という"], ["an old man", "おじいさん"], ["from", "から"], ["heard", "きく"], ["story", "話", "おはなし"], ["is。", "です"]];
        const english = "This is a story I heard from an old man in my village called Mohei, when I was small.".split(" ");
        const m = english.map((w, k) => [w, words[Math.min(k, words.length - 1)], [Math.min(k, words.length - 1)], null]);
        const help = { format: "lexicommons-weave", v: 1, book: text.id, bookVersion: text.version, kind: "help", from: "ja", to: "en", licence: "CC0-1.0", made: { by: "hand", note: "a check's fixture" }, sentences: [{ s: 0, e: words.length, h: await fmt.sentenceHash(words, 0, words.length), t, text: english.join(" "), m }] };
        const wrong = await fmt.validateWeave(help, text);
        if (wrong.length) throw new Error(`the help fixture: ${wrong.join(" | ")}`);
        await store.addBook(text, { en: help });
        id = text.id;
      }
      const bankApi = await import("/js/read/bank.js");
      // This language's words start empty each time, so each still shows only its own.
      for (const entry of bankApi.bankWords(lang)) bankApi.removeWord(lang, entry.lemma ?? entry);
      for (const lemma of bank) bankApi.addWord(lang, lemma, { quiet: true });
      if (just) bankApi.addWord(lang, just.lemma, { at: just.at, book: id, quiet: true });
      const { record } = await import("/js/study/progress.js");
      const day = 86_400_000;
      const now = Date.now();
      const uids = [];
      for (const lemma of readKnown) for (const ago of [30, 14, 6, 2]) uids.push(...record([{ concept: `w:${lemma}`, at: now - ago * day, lang, skill: "read", test: "recall", outcome: "right", activity: "type", item: "b4-check" }]).map((row) => row.uid));
      // record() keeps the rows in memory at once and saves them to IndexedDB in the background, and the reload below starts the app from
      // what's saved: on straight away, the last word's rows were sometimes cut off (時間, the last known by reading, kept its reading in 2 of
      // 4 runs, 6 Nov). On only once every row is saved.
      const saved = () =>
        new Promise((resolve) => {
          const open = indexedDB.open("lexicommons-study");
          open.onerror = () => resolve(false);
          open.onsuccess = () => {
            const db = open.result;
            const all = db.transaction("evidence").objectStore("evidence").getAll();
            all.onsuccess = () => {
              const have = new Set(all.result.map((row) => row.uid));
              db.close();
              resolve(uids.every((uid) => have.has(uid)));
            };
            all.onerror = () => (db.close(), resolve(false));
          };
        });
      const started = performance.now();
      let ok = await saved();
      for (let k = 0; k < 50 && !ok; k++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        ok = await saved();
      }
      if (!ok) throw new Error(`the evidence for ${readKnown.join(", ")} never reached IndexedDB`);
      return { id, savedAfter: Math.round(performance.now() - started) };
    },
    { lang, bank, just, readKnown, weavePrefs, book },
  );
  if (readKnown.length) console.log(`      ${lang}: the evidence for ${readKnown.join(", ")} saved ${set.savedAfter} ms after it was recorded`);
  const id = book === "bakery" ? "demo-bakery-corner" : "fixture-gon";
  await page.goto(`${BASE}/app/#read/book/${id}`);
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  await page.evaluate(() => document.fonts.ready);
}
// What the reader shows: per woven word its text (no readings), reading, whether that's hidden, its English under it.
const looks = () =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const text = (n) => [...n.childNodes].map((c) => (c.nodeType === 3 ? c.textContent : c.matches?.("rt") ? "" : text(c))).join("");
    const words = [...root.querySelectorAll('[data-part="reader-text"] [data-part="woven-word"]')].filter((w) => w.offsetHeight).map((w) => {
      const reading = w.querySelector('[data-part="reading"]');
      const under = w.querySelector('[data-part="reader-gloss"][data-state="under"]');
      const base = w.getBoundingClientRect();
      return {
        text: text(w).trim(),
        line: Boolean(w.closest('[data-part="reader-sentence"]')),
        reading: reading ? [...w.querySelectorAll('[data-part="reading"]')].map((r) => r.textContent.replace(/\u2060/g, "")).join("") : null,
        joiners: [...w.querySelectorAll('[data-part="reading"]')].filter((r) => r.textContent.startsWith("\u2060")).map((r) => r.textContent.slice(1)),
        hidden: reading ? reading.getAttribute("data-state") === "hidden" : null,
        readingAbove: reading ? reading.getBoundingClientRect().bottom <= base.top + base.height * 0.55 : null,
        under: under ? under.textContent : null,
        underBelow: under ? under.getBoundingClientRect().top >= base.top + base.height * 0.45 : null,
        state: w.getAttribute("data-state"),
        underline: getComputedStyle(w).textDecorationLine.includes("underline"),
        rects: w.getClientRects().length,
      };
    });
    return { readings: root.hasAttribute("data-readings"), underlineAttr: root.hasAttribute("data-underline"), words };
  }, READER);
const lines = () =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const text = (n) => [...n.childNodes].map((c) => (c.nodeType === 3 ? c.textContent : c.matches?.("rt") ? "" : text(c))).join("");
    return [...root.querySelectorAll('[data-part="reader-text"] [data-part="reader-sentence"]')].filter((s) => s.offsetHeight).map((s) => {
      const line = s.querySelector(".lx-sentence-line");
      const literal = s.querySelector('[data-part="reader-literal"]');
      const english = [...line.querySelectorAll(".lx-in-line")].map((e) => e.textContent);
      // A word of the language never breaks across lines (English among it may, at its own spaces).
      const broken = [...line.children].filter((c) => c.tagName === "SPAN" && !c.classList.contains("lx-in-line") && c.getClientRects().length > 1 && !c.querySelector("ruby")).map((c) => c.textContent);
      return {
        state: s.getAttribute("data-state"),
        text: text(line).trim(),
        wbr: line.querySelectorAll("wbr").length,
        english,
        broken,
        literal: literal ? literal.textContent : null,
        moved: literal ? literal.querySelectorAll('[data-meaning="moved"], [data-moved], .lx-moved').length : null,
      };
    });
  }, READER);
const zenOff = async () => {
  if ((await page.locator(READER).getAttribute("data-state")) === "zen") await page.locator(`${READER} [data-part="reader-collapse"]`).click();
};
async function flipUnderline() {
  await zenOff();
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await page.waitForTimeout(500);
  // Under More settings (it stays open once opened).
  const more = page.locator(`${READER} [data-part="sheet"]:not([hidden]) details.lx-reader-more`).first();
  if (!(await more.evaluate((n) => n.open))) await more.locator("summary").click();
  await page.locator(`${READER} [data-part="sheet"] [data-part="list-row"]`, { hasText: "Underline the" }).click();
  await page.keyboard.press("Escape");
  await page.waitForFunction((sel) => !document.querySelector(`${sel} [data-part="sheet"]:not([hidden])`), READER);
  await page.waitForTimeout(300);
}
const HAN = /\p{Script=Han}/u;
// Words that run past the text's column on the page shown: a word never breaks (nowrap), so a line needs a break
// between two words (a <wbr> in a language written without spaces) or a long run of them overflows.
const overflowing = () =>
  page.evaluate((sel) => {
    const text = document.querySelector(`${sel} [data-part="reader-text"]`);
    const r = text.getBoundingClientRect();
    const cs = getComputedStyle(text);
    const [left, right] = [r.left + parseFloat(cs.paddingLeft) - 1, r.right - parseFloat(cs.paddingRight) + 1];
    return [...text.querySelectorAll('[data-part="reader-word"], [data-part="woven-word"], [data-part="reader-help"], .lx-sentence-line > span')]
      .filter((w) => [...w.getClientRects()].some((b) => b.width && b.right > r.left && b.left < r.right && (b.right > right || b.left < left)))
      .map((w) => w.textContent.replace(/\u2060/g, ""));
  }, READER);

await stage("sign up with a passkey", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "B4 Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  return "signed in";
});

// The Bakery's Japanese weave: 日 (sun) and 猫 (cat) you know by reading; パン屋 (bakery, word 10) just added.
const JA_BANK = ["日", "猫", "窓", "角", "通り", "だ", "静か", "この", "時間", "好き", "一番", "古い", "歌", "町", "見る", "昇る", "前"];

await stage("Japanese, English order: readings over the kanji (hidden once known by reading), a just-added word's English under it", async () => {
  await setUp({ lang: "ja", bank: JA_BANK, just: { lemma: "パン屋", at: 10 }, readKnown: ["日", "猫", "時間"] });
  const { readings, words } = await looks();
  assert(readings, "the reader has no data-readings");
  const among = words.filter((w) => !w.line);
  const byText = (t) => among.find((w) => w.text.replace(/[.,]$/, "") === t);
  const sun = byText("日");
  assert(sun && sun.reading === "ひ" && sun.hidden === true, `日 (known by reading): ${JSON.stringify(sun)}`);
  const corner = byText("角");
  assert(corner && corner.reading === "かど" && corner.hidden === false && corner.readingAbove, `角: ${JSON.stringify(corner)}`);
  const bakery = byText("パン屋");
  assert(bakery && bakery.reading === "や" && bakery.under === "bakery" && bakery.underBelow && bakery.state === "new" && !bakery.underline, `パン屋 (just added): ${JSON.stringify(bakery)}`);
  const kana = among.find((w) => !HAN.test(w.text));
  assert(!kana || kana.reading === null, `a word in kana has a reading: ${JSON.stringify(kana)}`);
  const plain = among.filter((w) => !w.state);
  assert(plain.length && plain.every((w) => w.underline), "a plain woven word isn't underlined by default");
  const spaced = await page.evaluate((sel) => {
    const w = [...document.querySelectorAll(`${sel} [data-part="reader-text"] [data-part="woven-word"]`)].find((n) => !n.closest('[data-part="reader-sentence"]') && n.offsetHeight);
    return { before: w.previousSibling?.textContent?.slice(-1) ?? null, after: w.textContent.slice(-1) };
  }, READER);
  assert(spaced.before === " " && spaced.after === " ", `spaces around a woven word in English order: ${JSON.stringify(spaced)}`);
  await shot("ja-english-order");
  return `${among.length} words in English order; 日 hidden, 角 かど over it, パン屋 や over and "bakery" under`;
});

await stage("Japanese, whole sentences: words run together (<wbr> between, none broken), the literal line with English marks and no moved marks", async () => {
  const sentences = (await lines()).filter((s) => s.state === "flipped");
  assert(sentences.length >= 2, `whole sentences: ${sentences.length}`);
  for (const s of sentences) {
    assert(!/ /.test(s.text), `a space in a Japanese line: ${s.text}`);
    assert(s.wbr > 0 && s.broken.length === 0, `wbr ${s.wbr}, broken ${s.broken}`);
    assert(s.literal && !/[、。，？！]/u.test(s.literal) && s.moved === 0, `literal line: ${s.literal} (moved marks ${s.moved})`);
  }
  const quiet = sentences.find((s) => s.text.startsWith("通り"));
  assert(quiet && quiet.text === "通りは静かだった。", `通りは静かだった。: ${JSON.stringify(quiet)}`);
  const { words } = await looks();
  const inLine = words.filter((w) => w.line);
  const hour = inLine.find((w) => w.text === "時間");
  assert(hour && hour.reading === "じかん" && hour.hidden === true, `時間 in a line (known by reading): ${JSON.stringify(hour)}`);
  assert(inLine.filter((w) => !w.state).every((w) => w.underline), "a woven word in a Japanese line isn't underlined by default");
  await page.locator(`${READER} [data-part="reader-sentence"][data-state="flipped"]`).first().scrollIntoViewIfNeeded();
  await shot("ja-whole-sentence");
  return sentences.map((s) => `${s.text} / ${s.literal}`).join(" · ");
});

await stage("Japanese, a tap: the hidden reading shows again, and the popover gives it", async () => {
  const hour = page.locator(`${READER} [data-part="reader-sentence"] [data-part="woven-word"]`, { hasText: "時間" }).first();
  await hour.click();
  await page.waitForSelector(`${READER} [data-part="word-popover"]`);
  const state = await hour.evaluate((w) => w.querySelector('[data-part="reading"]')?.getAttribute("data-state") ?? "none");
  assert(state !== "hidden", `the reading is still hidden: ${state}`);
  const popover = await page.locator(`${READER} [data-part="word-popover"]`).innerText();
  assert(popover.includes("時間") && popover.includes("じかん"), `the popover: ${popover}`);
  await shot("ja-tap");
  await page.keyboard.press("Escape");
  return popover.replace(/\s+/g, " ").slice(0, 80);
});

await stage("Japanese order (the setting): the sentence in Japanese order, English among it with English marks and a narrow gap", async () => {
  await setUp({ lang: "ja", bank: ["日", "猫", "窓", "角", "前", "昇る"], readKnown: ["日"], weavePrefs: { order: true } });
  const ordered = (await lines()).filter((s) => s.state === "ordered");
  assert(ordered.length >= 3, `ordered lines: ${ordered.length}`);
  const english = ordered.flatMap((s) => s.english);
  assert(english.length > 0 && english.every((e) => !/[、。，？！]/u.test(e)), `English among the Japanese: ${english.slice(0, 6)}`);
  const gap = await page.evaluate((sel) => {
    const e = document.querySelector(`${sel} .lx-sentence-line > .lx-in-line:not(:first-child)`);
    return e ? parseFloat(getComputedStyle(e).marginLeft) : null;
  }, READER);
  assert(gap > 0, `no narrow gap before English in a Japanese line: ${gap}`);
  for (const s of ordered) {
    assert(s.broken.length === 0, `broken: ${s.broken}`);
    assert(/[.?!。？！][”’」』]?$/u.test(s.text), `a line without its sentence's end: ${s.text}`);
    const twice = s.english.find((e, x) => x > 0 && e === s.english[x - 1]);
    assert(!twice, `the same English twice running: ${twice} in ${s.text}`);
  }
  // 前 (known) and its に (sharing "before") stay together, in Japanese.
  assert(ordered.some((s) => s.text.includes("前に")), `前に: ${ordered.map((s) => s.text).join(" | ")}`);
  await shot("ja-japanese-order");
  return `${ordered.length} lines; first: ${ordered[0].text.slice(0, 40)}…`;
});

await stage("the underline switch: off takes the dotted line off woven words, in English order and in a Japanese line; on again", async () => {
  await setUp({ lang: "ja", bank: JA_BANK, readKnown: ["日"] });
  const on = await looks();
  assert(on.underlineAttr && on.words.filter((w) => !w.state).every((w) => w.underline), "on by default");
  await flipUnderline();
  const off = await looks();
  const plainOff = off.words.filter((w) => !w.state);
  assert(!off.underlineAttr && plainOff.length && plainOff.every((w) => !w.underline), `still underlined: ${plainOff.filter((w) => w.underline).map((w) => w.text)}`);
  assert(plainOff.some((w) => w.line) && plainOff.some((w) => !w.line), "both kinds of place weren't on the page");
  await shot("ja-underline-off");
  await flipUnderline();
  const back = await looks();
  assert(back.underlineAttr && back.words.filter((w) => !w.state).every((w) => w.underline), "on again");
  return `${plainOff.length} woven words (${plainOff.filter((w) => w.line).length} in Japanese lines) without the line; on again`;
});

await stage("lines leave room for readings", async () => {
  const lh = await page.evaluate((sel) => {
    const t = document.querySelector(`${sel} [data-part="reader-text"]`);
    const cs = getComputedStyle(t);
    return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
  }, READER);
  assert(lh > 2, `line height ${lh}`);
  return `line height ${lh.toFixed(2)}× the text`;
});

// The text starts at 24px in a book woven into Japanese, and keeps it with the weave off (no jump); a size you pick wins.
const textLook = () =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const cs = getComputedStyle(root.querySelector('[data-part="reader-text"]'));
    return { px: cs.fontSize, lh: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), readings: root.hasAttribute("data-readings"), lang: root.hasAttribute("data-lang-readings") };
  }, READER);
await stage("the text size: 24px by default, the same with the weave off; a size you pick stays", async () => {
  const on = await textLook();
  assert(on.px === "24px" && on.lang && on.readings, `weave on: ${JSON.stringify(on)}`);
  await setUp({ lang: "ja", bank: JA_BANK, weavePrefs: { on: false } });
  const off = await textLook();
  assert(off.px === "24px" && off.lang && !off.readings && off.lh < 2, `weave off: ${JSON.stringify(off)}`);
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
    prefs.size = 20;
    localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
  });
  await setUp({ lang: "ja", bank: JA_BANK });
  const picked = await textLook();
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
    delete prefs.size;
    localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
  });
  assert(picked.px === "20px", `a picked size: ${JSON.stringify(picked)}`);
  return `on ${on.px} (line ${on.lh.toFixed(2)}×), off ${off.px} (line ${off.lh.toFixed(2)}×, no room for readings), picked 20 → ${picked.px}`;
});

await stage("Chinese: pinyin over the characters (hidden once known by reading), a whole sentence run together", async () => {
  await setUp({ lang: "zh", bank: ["街上", "很", "安静", "她", "最", "喜欢", "这", "个", "时候", "猫", "太阳", "面包店", "窗户"], readKnown: ["她", "猫"] });
  const { readings, words } = await looks();
  assert(readings, "no data-readings");
  const among = words.filter((w) => !w.line);
  const sun = among.find((w) => w.text.startsWith("太阳"));
  assert(sun && sun.reading?.replace(/\s/g, "") === "tàiyáng" && sun.hidden === false && sun.readingAbove, `太阳: ${JSON.stringify(sun)}`);
  const quiet = (await looks()).words.find((w) => w.text.startsWith("安静"));
  assert(quiet && quiet.joiners.includes("ān") && !quiet.joiners.includes("jìng"), `安静's ruby text (ān starts with a marked letter, so a word joiner first): ${JSON.stringify(quiet)}`);
  const cat = among.find((w) => w.text.startsWith("猫"));
  assert(cat && cat.hidden === true, `猫 (known by reading): ${JSON.stringify(cat)}`);
  const sentences = (await lines()).filter((s) => s.state === "flipped");
  assert(sentences.length >= 1 && sentences.every((s) => !/ /.test(s.text) && s.moved === 0 && !/[，。？！]/u.test(s.literal ?? "")), `whole sentences: ${JSON.stringify(sentences.map((s) => [s.text, s.literal, s.moved]))}`);
  await shot("zh-reader");
  return `${among.length} words in English order; ${sentences.map((s) => s.text).join(" · ")}`;
});

await stage("a Japanese book with English help: reading over, English under; names and particles neither; in place, English with a narrow gap", async () => {
  await setUp({ lang: "ja", book: "gon", bank: ["これ", "私", "の", "です"], readKnown: ["私"] });
  const words = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-part="reader-text"] [data-part="reader-word"]`)].map((w) => ({
    reading: w.querySelector('[data-part="reading"]')?.textContent.replace(/\u2060/g, "") ?? null,
    hidden: w.querySelector('[data-part="reading"]')?.getAttribute("data-state") === "hidden",
    under: w.querySelector('[data-part="reader-gloss"][data-state="under"]')?.textContent ?? null,
    lemma: w.getAttribute("data-lemma"),
  })), READER);
  const village = words.find((w) => w.lemma === "村");
  assert(village && village.reading === "むら" && village.under === "village", `村: ${JSON.stringify(village)}`);
  const when = words.find((w) => w.lemma === "とき");
  assert(when && when.reading === null && when.under === "when", `とき (kana, no reading): ${JSON.stringify(when)}`);
  const lh = await page.evaluate((sel) => { const cs = getComputedStyle(document.querySelector(`${sel} [data-part="reader-text"]`)); return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); }, READER);
  assert(lh > 2.5, `a help page's line height ${lh}`);
  const me = words.find((w) => w.lemma === "私");
  assert(me && me.reading === "わたし" && me.hidden && me.under === null, `私 (known): ${JSON.stringify(me)}`);
  const plainText = await page.locator(`${READER} [data-part="reader-text"]`).innerText();
  assert(plainText.includes("茂平"), "the name");
  const name = await page.evaluate((sel) => {
    const w = [...document.querySelectorAll(`${sel} [data-part="reader-text"] .lx-w`)].find((n) => n.textContent.includes("茂平"));
    return w ? w.querySelectorAll("rt").length : -1;
  }, READER);
  assert(name === 0, `the name 茂平 carries ${name} readings or glosses`);
  const out = await overflowing();
  assert(!out.length, `words past the text's edge: ${out.join(" ")}`);
  await shot("ja-help-gloss");
  await setUp({ lang: "ja", book: "gon", bank: ["これ", "私", "の", "です"], readKnown: ["私"], weavePrefs: { help: "place" } });
  const inPlace = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-part="reader-text"] [data-part="reader-help"]`)].map((h) => ({ text: h.textContent, gap: parseFloat(getComputedStyle(h).marginLeft) })), READER);
  assert(inPlace.length > 0 && inPlace.every((h) => h.gap > 0 && !/[、。]/u.test(h.text)), `in place: ${JSON.stringify(inPlace.slice(0, 4))}`);
  const placeLh = await page.evaluate((sel) => { const cs = getComputedStyle(document.querySelector(`${sel} [data-part="reader-text"]`)); return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); }, READER);
  assert(placeLh > 2 && placeLh < 2.5, `in place, nothing under the words: line height ${placeLh}`);
  const outInPlace = await overflowing();
  assert(!outInPlace.length, `in place, words past the text's edge: ${outInPlace.join(" ")}`);
  await shot("ja-help-in-place");
  return `村 むら over, "village" under; 私 known; in place: ${inPlace.map((h) => h.text).join(" ")}`;
});

// Vowel marks (lang/readings.js "vowels": Arabic, Hebrew, Latin's macrons), on test languages registered in the page
// only, each reader mounted with openReader over the app: the marks are on the word itself, in its place (no room over
// the line, no 24px default), the word as written once you know it by reading, a tap bringing the marks back; a book
// with help has them too, its English over its words.
const VOWEL_LANGS = {
  xl: { name: "Latin test", locale: "xl-XL", segmenter: "spaces", separator: " ", lemmaCase: "lower", abbreviations: [], readings: "vowels", patterns: {} },
  xh: { name: "Hebrew test", locale: "xh-XH", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "vowels", patterns: {} },
};
// Mounts a reader on a book and a weave (or help), full screen over the app, and reads what its woven or helped words
// show: their visible text, whether their marks are hidden, their direction, any English over them.
const mountVowels = (spec) =>
  page.evaluate(
    async ({ spec, langs }) => {
      const { LANGUAGES } = await import("/js/lang/index.js");
      Object.assign(LANGUAGES, langs);
      const { parseText } = await import("/js/read/import-text.js");
      const { openReader } = await import("/js/read/reader.js");
      const { el } = await import("/js/lx/ui.js");
      const { record } = await import("/js/study/progress.js");
      const day = 86_400_000;
      const now = Date.now();
      for (const lemma of spec.readKnown) for (const ago of [30, 14, 6, 2]) record([{ concept: `w:${lemma}`, at: now - ago * day, lang: spec.lang, skill: "read", test: "recall", outcome: "right", activity: "type", item: "b4-check" }]);
      document.getElementById("b4-vowels")?.remove();
      const host = el("div", { id: "b4-vowels" });
      document.body.append(host);
      const book = parseText(spec.text, { title: "Vowels", lang: spec.bookLang });
      const weave = { format: "lexicommons-weave", kind: spec.kind, from: spec.from, to: spec.to, sentences: spec.sentences.map((t, x) => ({ s: spec.cuts[x], e: spec.cuts[x + 1], t, text: "x", m: [] })) };
      openReader(host, { book, word: 0, mode: "scroll", weave, know: new Set(spec.know) }).setZen(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const root = host.querySelector('[data-part="reader"]');
      const cs = getComputedStyle(root.querySelector('[data-part="reader-text"]'));
      const words = [...root.querySelectorAll('[data-part="reader-text"] :is([data-part="woven-word"], [data-part="reader-word"])')].map((w) => ({
        shown: w.innerText.trim(),
        lemma: w.getAttribute("data-lemma"),
        marks: w.querySelector('[data-part="reading"][data-variant="vowels"]')?.textContent ?? null,
        hidden: w.querySelector('[data-part="reading"][data-variant="vowels"]')?.getAttribute("data-state") === "hidden",
        dir: w.getAttribute("dir"),
        over: w.querySelector('rt[data-part="reader-gloss"]:not([data-state="under"])')?.textContent ?? null,
        popover: w.getAttribute("data-reading"),
      }));
      return { readings: root.hasAttribute("data-readings"), langReadings: root.hasAttribute("data-lang-readings"), px: cs.fontSize, lh: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), words };
    },
    { spec, langs: VOWEL_LANGS },
  );
const BOOK = "The sun rose over the city. The girl loved the city.";
const CUTS = [0, 6, 11];
await stage("vowel marks: Latin woven into an English book, its macrons on the word; known, as written; a tap brings them back", async () => {
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  // sol is known by reading; orior and puella aren't in your words, so each sentence keeps English order.
  const look = await mountVowels({ lang: "xl", kind: "weave", from: "en", to: "xl", text: BOOK, cuts: CUTS, readKnown: ["sol"], know: ["sol", "urbs", "amo"], sentences: [
    [["The", null], ["sol", "sol", "sōl"], ["orta", "orior", "ōrta"], ["over", null], ["the", null], ["urbem.", "urbs", "urbem"]],
    [["The", null], ["puella", "puella"], ["amavit", "amo", "amāvit"], ["the", null], ["urbem.", "urbs"]],
  ] });
  assert(!look.readings && !look.langReadings && look.lh < 2, `no room over the lines, no 24px default: ${JSON.stringify(look)}`);
  const sol = look.words.find((w) => w.lemma === "sol");
  assert(sol && sol.shown === "sol" && sol.marks === "sōl" && sol.hidden, `sol (known by reading): ${JSON.stringify(sol)}`);
  const amavit = look.words.find((w) => w.lemma === "amo");
  assert(amavit && amavit.shown === "amāvit" && !amavit.hidden, `amāvit: ${JSON.stringify(amavit)}`);
  const urbem = look.words.filter((w) => w.lemma === "urbs");
  // One urbem carries a reading that adds no macron (it doesn't fit): as written, and nothing for the popover to show.
  assert(urbem.length === 2 && urbem.every((w) => w.shown === "urbem." && w.marks === null && w.popover === null), `urbem (no reading, or one that doesn't fit): ${JSON.stringify(urbem)}`);
  assert(amavit.popover === "amāvit", `amāvit's popover reading: ${JSON.stringify(amavit)}`);
  await page.screenshot({ path: join(OUT, "shots", `${shots++}-vowels-latin.png`) });
  await page.locator('#b4-vowels [data-part="woven-word"][data-lemma="sol"]').click();
  await page.waitForTimeout(400);
  const tapped = await page.evaluate(() => ({
    shown: document.querySelector('#b4-vowels [data-part="woven-word"][data-lemma="sol"]').innerText.trim(),
    popover: document.querySelector('#b4-vowels [data-part="word-popover"]')?.innerText ?? "",
  }));
  assert(tapped.shown === "sōl" && tapped.popover.includes("sōl"), `after a tap: ${JSON.stringify(tapped)}`);
  return `sol (known) → sōl after a tap; amāvit; urbem plain; ${look.px}, line ${look.lh.toFixed(2)}×`;
});
await stage("vowel marks: Hebrew woven into an English book, points on the word, each its own isolate", async () => {
  const look = await mountVowels({ lang: "xh", kind: "weave", from: "en", to: "xh", text: BOOK, cuts: CUTS, readKnown: ["שמש"], know: ["שמש", "עיר", "אהב"], sentences: [
    [["The", null], ["שמש", "שמש", "שֶׁמֶשׁ"], ["עלתה", "עלה", "עָלְתָה"], ["over", null], ["the", null], ["עיר.", "עיר", "עִיר"]],
    [["The", null], ["ילדה", "ילדה", "יַלְדָּה"], ["אהבה", "אהב", "אָהֲבָה"], ["the", null], ["עיר.", "עיר", "עִיר"]],
  ] });
  assert(!look.readings && !look.langReadings, `no room over the lines: ${JSON.stringify(look)}`);
  const sun = look.words.find((w) => w.lemma === "שמש");
  assert(sun && sun.shown === "שמש" && sun.hidden && sun.dir === "rtl", `שמש (known by reading): ${JSON.stringify(sun)}`);
  const city = look.words.filter((w) => w.lemma === "עיר");
  assert(city.length === 2 && city.every((w) => w.shown === "עִיר." && !w.hidden && w.dir === "rtl"), `עִיר: ${JSON.stringify(city)}`);
  const loved = look.words.find((w) => w.lemma === "אהב");
  assert(loved && loved.shown === "אָהֲבָה", `אָהֲבָה: ${JSON.stringify(loved)}`);
  await page.screenshot({ path: join(OUT, "shots", `${shots++}-vowels-hebrew.png`) });
  return `שמש (known) as written; ${city[0].shown} ${loved.shown} pointed, right to left`;
});
await stage("vowel marks: a Latin book with English help, the macrons on its words and the English over them", async () => {
  const look = await mountVowels({ lang: "xl", bookLang: "xl", kind: "help", from: "xl", to: "en", text: "Puella Romam amat.", cuts: [0, 3], readKnown: [], know: ["puella"], sentences: [
    [["the girl", "puella"], ["to Rome", "roma", "Rōmam"], ["loves.", "amo"]],
  ] });
  assert(!look.readings && !look.langReadings, `no room over the lines: ${JSON.stringify(look)}`);
  const rome = look.words.find((w) => w.lemma === "roma");
  assert(rome && rome.shown.startsWith("Rōmam") && rome.over === "to Rome", `Rōmam: ${JSON.stringify(rome)}`);
  await page.screenshot({ path: join(OUT, "shots", `${shots++}-vowels-latin-help.png`) });
  await page.evaluate(async (codes) => {
    document.getElementById("b4-vowels")?.remove();
    const { LANGUAGES } = await import("/js/lang/index.js");
    for (const code of codes) delete LANGUAGES[code];
  }, Object.keys(VOWEL_LANGS));
  return `${rome.marks} with "${rome.over}" over it`;
});

// A verse line woven whole (Spanish, as Peter Rabbit's "and Peter." flips to "y Peter."): the verse's hanging indent (text-indent) is the
// paragraph's own, and a flipped sentence is a column of boxes inside it, its literal line's chunks flex items. On the reader before 6 Nov each
// of those took the -1em again: the line back at the verse's edge, and the chunks drawn over each other ("anRdeter"). Measured by the text
// itself (a Range over each chunk's words), since the chunks' boxes stayed in place while their words moved.
await stage("a verse line woven whole: it keeps the verse's indent, and its word-for-word line's chunks sit side by side inside the line", async () => {
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  const look = await page.evaluate(async () => {
    const { parseText } = await import("/js/read/import-text.js");
    const { openReader } = await import("/js/read/reader.js");
    const { el } = await import("/js/lx/ui.js");
    document.getElementById("b4-verse")?.remove();
    const host = el("div", { id: "b4-verse" });
    document.body.append(host);
    const book = parseText("Their names were—\n\nFlopsy,\n\nMopsy,\n\nCotton-tail,\n\nand Peter.\n\nand lived happily.\n\nThey lived with their mother.", { title: "Verse", lang: "en" });
    // Its short lines as verse, as a book's converter marks them (k "v").
    book.paras = book.paras.map((p, x) => (x >= 1 && x <= 5 ? { ...p, k: "v" } : p));
    const DICT = { Their: ["Sus", "su"], names: ["nombres", "nombre"], "were—": ["eran—", "ser"], and: ["y", "y"], lived: ["vivieron", "vivir"], "happily.": ["felices.", "feliz"], They: ["Ellos", "ellos"], with: ["con", "con"], their: ["su", "su"], "mother.": ["madre.", "madre"] };
    const sentences = book.sentences.map(([s, e]) => {
      const t = book.words.slice(s, e).map((w) => DICT[w] ?? [w, null]);
      return { s, e, t, text: t.map(([target]) => target).join(" "), m: t.map(([target, lemma], j) => [target, book.words[s + j].replace(/[.,—]+$/u, ""), [j], lemma]) };
    });
    const weave = { format: "lexicommons-weave", kind: "weave", from: "en", to: "es", sentences };
    // y, vivir and feliz known: "and Peter." and "and lived happily." are whole in Spanish; the prose around them isn't.
    openReader(host, { book, word: 0, mode: "scroll", weave, know: new Set(["y", "vivir", "feliz"]) }).setZen(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await document.fonts.ready;
    const root = host.querySelector('[data-part="reader"]');
    const textLeft = (node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getClientRects()[0];
      return r ? r.left : null;
    };
    const verses = [...root.querySelectorAll('[data-part="reader-verse"]')];
    const plain = verses.find((v) => !v.querySelector('[data-part="reader-sentence"][data-state="flipped"]'));
    const flipped = verses.filter((v) => v.querySelector('[data-part="reader-sentence"][data-state="flipped"]')).map((v) => {
      const line = v.querySelector('[data-part="reader-sentence"][data-state="flipped"] .lx-sentence-line');
      const literal = v.querySelector('[data-part="reader-literal"]');
      const lit = literal?.getBoundingClientRect();
      const cs = literal ? getComputedStyle(literal) : null;
      // Each chunk's words as drawn: where they start and end, on which line.
      const chunks = [...(literal?.querySelectorAll('[data-part="literal-chunk"]') ?? [])].map((c) => {
        const range = document.createRange();
        range.selectNodeContents(c);
        const r = range.getBoundingClientRect();
        return { text: c.textContent, left: r.left, right: r.right, top: Math.round(r.top) };
      });
      const overlaps = chunks.slice(1).filter((c, k) => c.top === chunks[k].top && c.left < chunks[k].right - 0.5).map((c, k) => `${chunks[k].text}|${c.text}`);
      return {
        said: line?.textContent.trim(),
        lineLeft: line ? textLeft(line) : null,
        chunks: chunks.map((c) => c.text),
        overlaps,
        // The literal line's words start inside its own edge (its border and padding), never left of them.
        firstInside: chunks.length && lit ? chunks[0].left - (lit.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)) : null,
      };
    });
    return { plainLeft: plain ? textLeft(plain) : null, flipped };
  });
  try {
    await page.screenshot({ path: join(OUT, "shots", `${shots++}-verse-whole.png`) });
    assert(look.plainLeft !== null && look.flipped.length === 2, `a plain verse line and two woven whole: ${JSON.stringify(look)}`);
    for (const f of look.flipped) {
      assert(f.lineLeft !== null && Math.abs(f.lineLeft - look.plainLeft) <= 1, `"${f.said}" starts at ${f.lineLeft?.toFixed(1)}, the verse at ${look.plainLeft.toFixed(1)}: ${JSON.stringify(look)}`);
      assert(f.chunks.length >= 2 && !f.overlaps.length, `"${f.said}": its word-for-word chunks ${JSON.stringify(f.chunks)} overlap: ${f.overlaps.join(", ")}`);
      assert(f.firstInside !== null && f.firstInside >= -0.5, `"${f.said}": its word-for-word line starts ${(-f.firstInside).toFixed(1)} px left of its own edge`);
    }
  } finally {
    // The reader mounted over the app goes either way (left up, it covered the next stage's buttons).
    await page.evaluate(() => document.getElementById("b4-verse")?.remove());
  }
  return look.flipped.map((f) => `${f.said} / ${f.chunks.join(" ")}`).join(" · ") + `; at the verse's ${look.plainLeft.toFixed(1)} px`;
});

await stage("delete the test account", async () => {
  await page.goto(`${BASE}/app/#settings/account`);
  await page.waitForSelector('[data-part="page-title"]');
  await page.getByText("Delete my account").click();
  await page.getByText("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  return "deleted";
});

await stage("no console errors", async () => {
  const real = problems.filter((p) => !/status of 401/.test(p));
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "b4-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
