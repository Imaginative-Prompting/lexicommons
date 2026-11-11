// When a word's reading goes (study/progress.js readingHides): kana or pinyin over it, Arabic's and Hebrew's vowel marks, Latin's long
// vowels, Russian's stress, a romanization, all shown until you know the word WELL, its read strength Strong (READING_HIDES_AT, level 3),
// never on `known`, which a new word's first right answer gives it (FSRS puts its first stability past a day; one tap in lesson 1 hid every
// reading before). On the real scheduler: a first right answer, picked or recalled, and a lesson's answers in a row keep it; a word at
// level 2 keeps it; level 3 and 4 hide it; a Strong word missed shows it again. Today's rule (knows) planted as the predicate first: it
// must fail. One rule on every screen: a word named anywhere (content.js shownName) on starter-ja's and starter-ar's words, and no file
// under public/js deciding a reading by knows() (Study's steps and choices, Explore's previews and the reader all through readingHides),
// a planted one caught. A tap bringing a hidden reading back is the browser's (ui.showReading on every spoken word: checked here by its
// handler, seen in the stills). A rule's own words show their forms' readings, its own files' and never a pack's, and never hide them
// (after-answer.js ruleText, 9 Nov 2026),
// each form with the language's text touching it as one quote, so its reading hangs over that kana (new-words.js ruleQuotes, ui.quotedText).
//   node scripts/test-reading-hides.mjs [<app dir>]   another copy's dir to see it fail on one from before (exit 0 = pass)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
const progress = await from("public/js/study/progress.js");
const { setLearning } = await from("public/js/study/learning.js");
const { savePack } = await from("public/js/study/packs.js");
const content = await from("public/js/study/content.js");

let failed = 0;
async function test(name, fn) {
  try {
    const said = await fn();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error).split("\n").join("\n      ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

const DAY = 86_400_000;
const NOW = Date.now();
let n = 0;
// A word of its own for each case, its answers at the days ago given (0: just now, as in a lesson).
function word(lang, answers) {
  const unit = `w:check-${lang}-${++n}`;
  // A minute apart, in the order given, so a lesson's answers on one day keep their order.
  answers.forEach(([daysAgo, outcome, test], i) => progress.record([{ concept: unit, lang, outcome, test, at: NOW - daysAgo * DAY - (answers.length - i) * 60_000 }]));
  return unit;
}
const level = (unit, lang) => progress.unitState(unit, { lang, now: NOW }).strengths.read?.level ?? 0;

// The cases, each with whether its reading should stay hidden.
function cases(lang) {
  return [
    ["a word never answered", word(lang, []), false],
    ["one right pick (Which one is it?), lesson 1", word(lang, [[0, "right", "pick"]]), false],
    ["one right recall (typed), lesson 1", word(lang, [[0, "right", "recall"]]), false],
    ["a lesson's answers in a row: picked, built, recalled", word(lang, [[0, "right", "pick"], [0, "right", "build"], [0, "right", "recall"]]), false],
    ["right the next day too", word(lang, [[1, "right", "recall"], [0, "right", "recall"]]), false],
    ["level 3 (Strong): right two days apart", word(lang, [[3, "right", "recall"], [1, "right", "recall"]]), true],
    ["level 3 (Strong): right a week apart", word(lang, [[12, "right", "recall"], [9, "right", "recall"], [5, "right", "recall"]]), true],
    ["level 4 (Solid)", word(lang, [[60, "right", "recall"], [50, "right", "recall"], [30, "right", "recall"], [10, "right", "recall"]]), true],
    ["Strong, then missed today", word(lang, [[12, "right", "recall"], [9, "right", "recall"], [5, "right", "recall"], [0, "wrong", "recall"]]), false],
  ];
}

// Each case against a predicate: what's wrong, as lines (none: it holds).
function judge(predicate, lang) {
  return cases(lang).flatMap(([what, unit, hides]) => {
    const got = predicate(unit, { lang, now: NOW });
    return got === hides ? [] : [`${what} (level ${level(unit, lang)}): ${got ? "hidden" : "shown"}, should be ${hides ? "hidden" : "shown"}`];
  });
}

await test("the control: today's rule (progress.js knows, one right answer) planted as the predicate is caught", () => {
  const wrong = judge((unit, options) => progress.knows(unit, options), "ja");
  assert(wrong.length >= 3, `knows() passes the cases: ${JSON.stringify(wrong)}`);
  return `${wrong.length} cases caught, as "${wrong[0]}"`;
});

await test("readingHides: a first right answer, a lesson's answers and level 2 keep the reading; Strong and Solid hide it; a Strong word missed shows it again", () => {
  assert(typeof progress.readingHides === "function", "progress.js has no readingHides");
  assert(progress.READING_HIDES_AT === 3, `READING_HIDES_AT is ${progress.READING_HIDES_AT}`);
  const levels = cases("ja").map(([what, unit]) => `${what.split(":")[0]} ${level(unit, "ja")}`);
  for (const lang of ["ja", "zh", "ar", "he", "la", "ru", "yi"]) {
    const wrong = judge(progress.readingHides, lang);
    assert(!wrong.length, `${lang}: ${wrong.join("; ")}`);
  }
  return `levels: ${levels.join(", ")}`;
});

// A word named anywhere (content.js shownName): its reading with it until it's Strong, on real packs' words.
await test("a word named anywhere (content.js shownName) follows the same rule, on starter-ja's and starter-ar's words", async () => {
  const said = [];
  for (const [lang, lemma] of [["ja", "飲む"], ["ar", "شرب"]]) {
    const pack = JSON.parse(readFileSync(join(APP, `packs/starter-${lang}.json`), "utf8"));
    const saved = await savePack(structuredClone(pack));
    assert(saved.ok, `starter-${lang} not saved: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
    setLearning(lang);
    await new Promise((done) => setTimeout(done, 20));
    const unit = `w:${lemma}`;
    assert(content.READINGS[lemma], `${lemma} has no reading in starter-${lang}`);
    const shows = () => typeof content.shownName(unit) === "object";
    assert(shows(), `${lemma}, never answered: shown without its reading`);
    progress.record([{ concept: unit, lang, outcome: "right", test: "pick", at: NOW - 2 * 60_000 }]);
    progress.record([{ concept: unit, lang, outcome: "right", test: "recall", at: NOW - 60_000 }]);
    assert(progress.knows(unit, { lang }) && shows(), `${lemma}, right twice in a lesson: its reading gone (known: ${progress.knows(unit, { lang })})`);
    const fresh = JSON.stringify(content.shownName(unit));
    // The same word Strong: right twelve, nine and five days before those.
    for (const days of [12, 9, 5]) progress.record([{ concept: unit, lang, outcome: "right", test: "recall", at: NOW - days * DAY }]);
    const strong = progress.unitState(unit, { lang }).strengths.read?.level;
    assert(strong >= 3 && typeof content.shownName(unit) === "string", `${lemma} at level ${strong}: ${JSON.stringify(content.shownName(unit))}, should be the word as written`);
    said.push(`${lemma} ${fresh} after a lesson, "${content.shownName(unit)}" at level ${strong}`);
  }
  return said.join("; ");
});

// A stray tile (Put it in order's, Listening's: a word the sentence hasn't got) shown as the sentence's words are, with its reading while its
// word is new: drawn from its text alone, it was the one tile without a stress mark in Russian (path-ru, 9 Nov), the answer given away.
await test("a stray tile shows its reading as the sentence's words do (new-words.js strayTile, session.js shownStray at both stray tiles): path-ru's and starter-ja's forms; the tile as its text alone, the rule from before, caught", async () => {
  const words = await from("public/js/study/new-words.js");
  const judge = (tile, cases) => cases.flatMap(([text, want]) => (JSON.stringify(tile(text)) === JSON.stringify(want) ? [] : [`${text}: ${JSON.stringify(tile(text))}, should be ${JSON.stringify(want)}`]));
  const said = [];
  for (const [lang, file, cases] of [
    ["ru", "packs/path-ru.json", [["молоко", ["молоко", "молоко", "молоко́"]], ["Мама", ["Мама", "мама", "Ма́ма"]], ["мама", ["мама", "мама", "ма́ма"]], ["воду", ["воду", "вода", "во́ду"]], ["в", ["в"]]]],
    ["ja", "packs/starter-ja.json", [["お水", ["お水", "水", "おみず"]], ["コーヒー", ["コーヒー"]]]],
  ]) {
    const saved = await savePack(structuredClone(JSON.parse(readFileSync(join(APP, file), "utf8"))));
    assert(saved.ok, `${file} not saved: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
    setLearning(lang);
    await new Promise((done) => setTimeout(done, 20));
    assert(judge((text) => [text], cases).length, `${lang}: the tile as its text alone (the rule from before) wasn't caught`);
    const wrong = judge(words.strayTile, cases);
    assert(!wrong.length, `${lang}: ${wrong.join("; ")}`);
    said.push(cases.map(([text]) => JSON.stringify(words.strayTile(text))).join(" "));
  }
  const session = readFileSync(join(APP, "public/js/study/session.js"), "utf8");
  assert(/const stray = strayText && !inEnglish \? shownStray\(strayText\)/.test(session), "Put it in order's stray tile isn't drawn through shownStray");
  assert(/\(step\.stray \?\? \[\]\)\.map\(shownStray\)/.test(session), "Listening's stray tiles aren't drawn through shownStray");
  return said.join("; ");
});

// An idea's card (a lesson's One idea, an answer's sheet) shows its sentence and its More like it lines as a sentence's words are shown
// everywhere: each word with its reading while it's new. Drawn bare before, in every reading language (Japanese 1–20 would have put kanji
// with no kana on every idea card).
await test("an idea's card draws its sentence, its examples, a part's chip and its note line with readings (new-words.js readingsOfText, readingsInText; after-answer.js withReadings, the picture's readings; concept-picture.js wordBody): path-ru's and starter-ja's forms; each line as its text alone, the rule from before, caught", async () => {
  const words = await from("public/js/study/new-words.js");
  const runs = (text, joined) => words.readingsOfText(text, joined).map(({ text: one, reading }) => (reading ? `${one}(${reading})` : one)).join(joined ? "" : " ");
  const judge = (read, cases) => cases.flatMap(([text, joined, want]) => (read(text, joined) === want ? [] : [`${text}: ${read(text, joined)}, should be ${want}`]));
  const said = [];
  for (const [lang, file, cases] of [
    ["ru", "packs/path-ru.json", [["Мы готовы.", false, "Мы готовы.(гото́вы)"], ["Он уже готов.", false, "Он уже(уже́) готов.(гото́в)"], ["Мама в машине.", false, "Мама(Ма́ма) в машине.(маши́не)"]]],
    ["ja", "packs/starter-ja.json", [["お水を飲みます。", true, "お水(おみず)を飲みます(のみます)。"], ["コーヒーを飲みます。", true, "コーヒーを飲みます(のみます)。"]]],
  ]) {
    const saved = await savePack(structuredClone(JSON.parse(readFileSync(join(APP, file), "utf8"))));
    assert(saved.ok, `${file} not saved: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
    setLearning(lang);
    await new Promise((done) => setTimeout(done, 20));
    assert(judge((text) => text, cases).length, `${lang}: each line as its text alone (the rule from before) wasn't caught`);
    const wrong = judge(runs, cases);
    assert(!wrong.length, `${lang}: ${wrong.join("; ")}`);
    said.push(cases.map(([text, joined]) => runs(text, joined)).join(" · "));
  }
  const read = (rel) => readFileSync(join(APP, rel), "utf8");
  const card = read("public/js/study/after-answer.js");
  const picture = read("public/js/study/concept-picture.js");
  const before = 'el("span", { class: "lx-rule-word", "data-lit": shape.lit.has(at) ? "" : undefined, "data-piece": shape.pieces.has(at) ? "" : undefined, "data-affixed": affixed(at) ? "" : undefined }, split(word)[0]),';
  const bare = (source) => source.includes(before) || !/\.\.\.wordBody\(split\(word\)\[0\], readings\[at\], lang\)/.test(source);
  assert(bare(picture.replace(/\.\.\.wordBody\(split\(word\)\[0\], readings\[at\], lang\)/, "split(word)[0]")), "the picture's bare words (the rule from before) weren't caught");
  assert(!bare(picture), "concept-picture.js still draws its words bare (no wordBody with the word's reading)");
  assert(/readings: own && item\?\.words\?\.length === own\.length \? item\.words\.map/.test(card), "conceptView doesn't give the card's sentence its readings");
  assert(/const exampleRow = [^\n]*\n(?:.*\n){0,8}.*withReadings\(/.test(card) && !/\.\.\.marked\(text, marks\)/.test(card), "More like it's lines aren't drawn through withReadings");
  assert(/readingsOfText\(text, joined\)/.test(card), "a rule's own example isn't given the packs' readings (readingsOfText)");
  // A part's chip and its note line: the sentence's own words in them as the sentence shows them (one card showed готовы bare under гото́вы).
  const inNote = (text, sentence) => words.readingsInText(text, sentence).map(({ text: one, reading }) => (reading ? `${one}(${reading})` : one)).join("");
  const notes = [
    ["готовы for мы.", [{ text: "Мы", reading: null }, { text: "готовы.", reading: "гото́вы", lemma: "готовый" }], "готовы(гото́вы) for мы."],
    ["Мама, here Mom.", [{ text: "мама", reading: "ма́ма", lemma: "мама" }, { text: "дома.", reading: "до́ма", lemma: "дома" }], "Мама(Ма́ма), here Mom."],
    ["飲みます, the form of 飲む; 私 is I.", [{ text: "私", reading: "わたし" }, { text: "は", reading: null }, { text: "飲みます", reading: "のみます", lemma: "飲む" }], "飲みます(のみます), the form of 飲む; 私(わたし) is I."],
  ];
  assert(notes.some(([text, , want]) => text !== want), "the note lines as their text alone (the rule from before) weren't caught");
  const wrongNotes = notes.filter(([text, sentence, want]) => inNote(text, sentence) !== want).map(([text, sentence, want]) => `${inNote(text, sentence)}, should be ${want}`);
  assert(!wrongNotes.length, `note lines: ${wrongNotes.join("; ")}`);
  assert(/const wordNote = [^\n]*\n(?:.*\n){0,4}.*\.\.\.withReadings\(\[\{ text: word\.slice/.test(card), "a part's chip doesn't draw its word with its reading (withReadings)");
  assert(/const noteLine = \(text, words\) => withReadings\(readingsInText\(text, words\)\)/.test(card) && /\.\.\.noteLine\(why, words\)/.test(card), "a part's note line doesn't give the sentence's own words their readings (readingsInText)");
  said.push(notes.map(([text, sentence]) => inNote(text, sentence)).join(" · "));
  return said.join("; ");
});

await test("a rule's own words (its name, short line, why, explanation, contrasts, a mistake's sentences) draw their forms' readings, never hidden: the grammar's and its longer file's own (lang/grammar.js readings), never a pack's (new-words.js readingsOfRuleText; after-answer.js ruleText; learn-more.js's idea row)", async () => {
  const words = await from("public/js/study/new-words.js");
  assert(typeof words.readingsOfRuleText === "function", "new-words.js has no readingsOfRuleText (rule text drawn as its text alone, the rule from before)");
  const saved = await savePack(structuredClone(JSON.parse(readFileSync(join(APP, "packs/starter-ja.json"), "utf8"))));
  assert(saved.ok, "starter-ja not saved");
  setLearning("ja");
  await new Promise((done) => setTimeout(done, 20));
  const runs = (text, own) => words.readingsOfRuleText(text, own).map(({ text: one, reading }) => (reading ? `${one}(${reading})` : one)).join("");
  const cases = [
    // The grammar's own map: a form no pack has.
    ["です after a noun says what something is: 学生です (I'm a student).", { 学生: "がくせい" }, "です after a noun says what something is: 学生(がくせい)です (I'm a student)."],
    // Never a pack's reading (starter-ja reads 飲みます のみます in its sentences): right there, it can be wrong in a rule's words (上 is うえ
    // in a pack, 上手 is じょうず), and these are never hidden. The rule from before took it.
    ["Polite verbs end in -ます: 飲みます (drink).", {}, "Polite verbs end in -ます: 飲みます (drink)."],
    // The longest form first.
    ["母を帰ります。", { 母: "はは", 帰: "かえ", 帰ります: "かえります" }, "母(はは)を帰ります(かえります)。"],
    ["Nothing of the language here.", { 学生: "がくせい" }, "Nothing of the language here."],
  ];
  const wrong = cases.filter(([text, own, want]) => runs(text, own) !== want).map(([text, own, want]) => `${runs(text, own)}, should be ${want}`);
  assert(cases.some(([text, , want]) => text !== want), "each rule's words as its text alone (the rule from before) weren't caught");
  assert(!wrong.length, wrong.join("; "));
  // Drawn as quotes (new-words.js ruleQuotes): each form with a reading together with the language's own text touching it, one isolate, so a
  // reading wider than its kanji hangs over the kana beside it as a sentence's does (one label per form, the rule from before, kept 私 and
  // は apart: Chromium won't hang a reading out of an isolate, nor WebKit out of a box). English, and the language's text with no reading, as text.
  assert(typeof words.ruleQuotes === "function", "new-words.js has no ruleQuotes (each form drawn as a label of its own, the rule from before)");
  const shown = (pieces) => pieces.map((piece) => (typeof piece === "string" ? piece : `«${piece.quote.map(({ text: one, reading }) => (reading ? `${one}(${reading})` : one)).join("|")}»`)).join("");
  const perForm = (all) => all.map(({ text: one, reading }) => (reading ? `«${one}(${reading})»` : one)).join("");
  const quoteCases = [
    ["comes last: 私はコーヒーを飲みます (I coffee drink).", { 私: "わたし", 飲みます: "のみます" }, "comes last: «私(わたし)|はコーヒーを|飲みます(のみます)» (I coffee drink)."],
    ["-ます is the same: 私は飲みます, 母は飲みます.", { 私: "わたし", 母: "はは", 飲みます: "のみます" }, "-ます is the same: «私(わたし)|は|飲みます(のみます)», «母(はは)|は|飲みます(のみます)»."],
    // Its 。 goes with it; the language's text with no reading stays text.
    ["Say 水をください。 to ask; は comes after it.", { 水: "みず" }, "Say «水(みず)|をください。» to ask; は comes after it."],
    // A form in Latin letters (a vowel reading) is its own quote; the English beside it never goes in.
    ["Say amo here.", { amo: "amō" }, "Say «amo(amō)» here."],
    // A combining mark stays in the quote with the letter it's on (か + ゙, written apart).
    ["Say 私か\u3099 now.", { 私: "わたし" }, "Say «私(わたし)|か\u3099» now."],
  ];
  const quoteWrong = quoteCases.filter(([text, own, want]) => shown(words.ruleQuotes(words.readingsOfRuleText(text, own))) !== want).map(([text, own, want]) => `${shown(words.ruleQuotes(words.readingsOfRuleText(text, own)))}, should be ${want}`);
  assert(perForm(words.readingsOfRuleText(quoteCases[0][0], quoteCases[0][1])) !== quoteCases[0][2], "one label per form (the rule from before) wasn't caught");
  assert(!quoteWrong.length, quoteWrong.join("; "));
  // Wired in: every rule-text spot of the card and Knowledge's sheet draws through ruleText, ruleText through ruleQuotes and ui.quotedText,
  // its readings the installed grammar's and longer file's; the drawer's idea row too. quotedText: one bdi of the language, each ruby straight
  // in it beside the text (no word box), nothing hidden.
  const card = readFileSync(join(APP, "public/js/study/after-answer.js"), "utf8");
  const drawer = readFileSync(join(APP, "public/js/study/learn-more.js"), "utf8");
  const rule = /export const ruleText = \(text, lang = contentLanguage\(\)\) =>\s*ruleQuotes\(readingsOfRuleText\(text, \{ \.\.\.grammarReadings\(lang\), \.\.\.moreReadings\(lang\) \}\)\)\.map\(\(piece\) => \(typeof piece === "string" \? piece : ui\.quotedText\(piece\.quote, lang\)\)\);/;
  assert(rule.test(card), "after-answer.js's ruleText isn't ruleQuotes over readingsOfRuleText with the grammar's and longer file's readings, drawn by ui.quotedText");
  const uiText = readFileSync(join(APP, "public/js/lx/ui.js"), "utf8");
  const quoted = /export function quotedText\(runs, lang = target\.code\) \{[\s\S]*?\n\}\n/.exec(uiText)?.[0] ?? "";
  assert(quoted, "lx/ui.js has no quotedText");
  assert(/el\(\s*"bdi",\s*\{ lang, class: "lx-quote" \},/.test(quoted) && /el\("ruby", \{\}, piece, el\("rt", \{ part: "reading" \}, rubyText\(reading\)\)\)/.test(quoted), "ui.quotedText doesn't put each ruby straight into one bdi of the language");
  assert(!/lx-word|hidden|wordLabel/.test(quoted.replace(/^\s*\*.*$/gm, "")), "ui.quotedText draws a word box, a label per form or a hidden reading");
  const css = readFileSync(join(APP, "public/css/lx/components.css"), "utf8");
  assert(/pieces\[i\]\.nodeName === "RUBY" && typeof pieces\[i - 1\] === "string"\) pieces\[i - 1\] \+= "\\u2060";/.test(quoted), "ui.quotedText puts no word joiner before a reading that follows text: Chromium ends a line there (を | 飲みます)");
  assert(/\{ lang, class: "lx-quote" \}/.test(quoted) && /\.lx-quote \{ word-break: keep-all; overflow-wrap: break-word; \}/.test(css), "a quote isn't kept on one line where it fits (.lx-quote's keep-all): 飲みま / す");
  const spots = {
    name: /el\("h2", \{ class: "lx-concept-name" \}, \.\.\.ruleText\(about\.name\)\)/,
    "short line": /el\("p", \{ class: "lx-concept-short" \}, \.\.\.ruleText\(about\.short \?\? about\.about\)\)/,
    why: /\[el\("span", \{ class: "lx-concept-mark", lang: contentLanguage\(\) \}, \.\.\.ruleText\(part\.slice\(2, -2\)\)\)\] : ruleText\(part\)/,
    explanation: /section\("All of it", el\("p", \{\}, \.\.\.ruleText\(about\.explain\)\)\)/,
    contrast: /\.\.\.ruleText\(says\)\)/,
    "a mistake's sentences": /el\("span", \{\}, \.\.\.ruleText\(text\)\)\)/,
    "a mistake's why": /el\("p", \{ class: "lx-concept-means" \}, \.\.\.ruleText\(why\)\)/,
  };
  const missing = Object.entries(spots).filter(([, re]) => !re.test(card)).map(([what]) => what);
  assert(!missing.length, `after-answer.js draws these bare: ${missing.join(", ")}`);
  assert(/el\("span", \{ class: "lx-learn-idea-line" \}, \.\.\.ruleText\(line\)\)/.test(drawer), "learn-more.js's idea row draws its line bare");
  return [...cases.map(([text, own]) => runs(text, own)), ...quoteCases.map(([text, own]) => shown(words.ruleQuotes(words.readingsOfRuleText(text, own))))].join(" · ");
});

// No file under public/js decides a reading by knows(): Study's steps and choices, Explore's previews and the reader all read readingHides.
const SCREENS = ["public/js/study/session.js", "public/js/study/content.js", "public/js/explore/explore.js", "public/js/read/reader.js"];
// knows() for anything but a reading, each with its reason.
const OTHER_USES = { "public/js/read/bank.js": "studied: the words weaving counts as yours (knownSet), not a reading" };
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : name.endsWith(".js") ? [join(dir, name)] : []));
const strays = (sources) => sources.filter(([rel, text]) => rel !== "public/js/study/progress.js" && !OTHER_USES[rel] && /\bknows\(/.test(text)).map(([rel]) => rel);

await test("one rule on every screen: no file under public/js decides a reading by knows() (a planted one caught), and each screen that hides one reads readingHides", () => {
  const sources = files(join(APP, "public/js")).map((path) => [relative(APP, path), readFileSync(path, "utf8")]);
  const planted = [...sources, ["public/js/study/planted.js", "const shown = ([text, lemma, reading]) => ({ text, reading, hidden: knows(`w:${lemma}`) });"]];
  assert(strays(planted).includes("public/js/study/planted.js"), "the planted knows() wasn't caught");
  const stray = strays(sources);
  assert(!stray.length, `deciding by knows(): ${stray.join(", ")}`);
  const missing = SCREENS.filter((rel) => !/\breadingHides\(/.test(sources.find(([one]) => one === rel)?.[1] ?? ""));
  assert(!missing.length, `not reading readingHides: ${missing.join(", ")}`);
  const reader = sources.find(([one]) => one === "public/js/read/reader.js")[1];
  assert(/const readingKnown = \(lemma\) => Boolean\(lemma\) && readingHides\(/.test(reader), "the reader's readingKnown isn't readingHides");
  const ui = sources.find(([one]) => one === "public/js/lx/ui.js")[1];
  assert(/"spoken-word"[^\n]*onclick: \(event\) => showReading\(event\.currentTarget\)/.test(ui), "a spoken word's tap no longer brings its reading back (ui.showReading)");
  return `${SCREENS.length} screens; knows() otherwise only in ${Object.keys(OTHER_USES).join(", ")}`;
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
