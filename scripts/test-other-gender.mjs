// The same sentence for the other gender (a pack item's otherGender: Obrigado / Obrigada, ¿Estás listo? / ¿Estás lista?): the pack's check
// keeping it and refusing it every way it can be wrong; from the English, typed (study/typed.js typedResult) or said (Say it: the matcher
// with the same variants, study/subjects.js asWritten), it's right too, exactly so, and shown as the learner gave it, with every word of the
// sentence counted known (attribute.js wordOutcomes); from what's heard it's still the very sentence; a language written without spaces
// (Thai: ผม…ครับ, ฉัน…ค่ะ) the same, and its sentences with the same English (hello-man, hello-woman) right from it too; and no game makes
// tiles or choices of it (it's read only by the pack's check, the grading and the answer's drawer: a scan of public/js, then every lesson,
// Practice and game a starter plans, read for its words).
//   node scripts/test-other-gender.mjs [<app dir>]   another copy's dir to see it fail on one from before (exit 0 = pass)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
const { savePack } = await from("public/js/study/packs.js");
const { setLearning } = await from("public/js/study/learning.js");
const content = await from("public/js/study/content.js");
const { checkPack } = await from("public/js/study/pack-format.js");
const { typedResult } = await from("public/js/study/typed.js");
const { typedRight, wordOutcomes } = await from("public/js/study/attribute.js");
const { match } = await from("public/js/speech/match.js");
const plan = await from("public/js/study/plan.js");
const subjects = await from("public/js/study/subjects.js");

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error).split("\n").join("\n      ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const read = (name) => JSON.parse(readFileSync(join(APP, "packs", name), "utf8"));

// The packs as they'll be published: each with otherGender on a few of its sentences (the lines of docs/languages/speaker-gender).
const OTHER = {
  "starter-pt.json": { "um-cafe-obrigado": ["Um café, obrigada.", "f", "speaker"], "eu-sou-professor": ["Eu sou professora.", "f", "speaker"], "voce-e-um-bom-amigo": ["Você é uma boa amiga.", "f", "listener"] },
  "path-es.json": { "l008-1": ["¿Estás lista?", "f", "listener"] },
  "starter-it.json": { "sono-un-insegnante": ["Sono un'insegnante.", "f", "speaker"] },
  "starter-uk.json": { "item-18": ["Я вчитель.", "m", "speaker"] },
  "starter-th.json": { "item-2": ["ฉันดื่มชา", "f", "speaker"], "item-20": ["ดื่มชาไหมคะ", "f", "speaker"] },
};
// A sentence not in any pack, as an item reads.
const made = (words, punct, means) => ({ id: "made/1", words, punct, means, text: words.map(([t]) => t).join(" ") + punct });
const withOther = (name) => {
  const pack = read(name);
  for (const item of pack.items) {
    const other = OTHER[name][item.id];
    if (other) item.otherGender = { text: other[0], gender: other[1], who: other[2] };
  }
  return pack;
};
for (const name of Object.keys(OTHER)) {
  const saved = await savePack(withOther(name));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
async function learning(lang) {
  setLearning(lang);
  await new Promise((done) => setTimeout(done, 20));
  assert(content.ITEMS.length && content.contentLanguage() === lang, `no ${lang} sentences on the device`);
}
const item = (id) => {
  const found = content.ITEMS.find((one) => one.id === id || one.id.endsWith(`/${id}`));
  assert(found, `no sentence ${id}`);
  return found;
};
// Typed from its English (Type it's default), forgiving accents and strict, as the game grades it.
const typed = (it, text, options = { fromEnglish: true }) => [true, false].map((forgiving) => typedResult(it, text, forgiving, options));
const right = (it, text, options) => typed(it, text, options).forEach((result, i) => assert(typedRight(result), `"${text}" for "${content.sentence(it)}" (${it.means}) should be right${i ? " with accents strict" : ""}: ${JSON.stringify(result.words.map((w) => [w.text, w.result]))}`));
const wrong = (it, text, options) => typed(it, text, options).forEach((result, i) => assert(!typedRight(result), `"${text}" for "${content.sentence(it)}" (${it.means}) should be wrong${i ? " with accents strict" : ""}`));
// What a result shows, as the typed line reads it: each word as the learner gave it.
const shownWords = (result) => result.words.map((word) => (typeof word.heard === "string" && word.heard ? word.heard : word.text)).join(" ");

// ---------- the pack's check ----------
const basePack = () => withOther("starter-pt.json");
const checked = (mutate) => {
  const pack = basePack();
  mutate(pack.items.find((one) => one.id === "um-cafe-obrigado"));
  return checkPack(pack, { installed: [] });
};

await test("the pack's check keeps otherGender as given ({ text, gender, who }) and refuses it every way it can be wrong", () => {
  const kept = checkPack(basePack(), { installed: [] });
  assert(kept.pack, `starter-pt with otherGender refused: ${JSON.stringify(kept.errors.slice(0, 2))}`);
  const one = kept.pack.items.find((it) => it.id === "um-cafe-obrigado");
  assert(JSON.stringify(one.otherGender) === JSON.stringify({ text: "Um café, obrigada.", gender: "f", who: "speaker" }), `kept as ${JSON.stringify(one.otherGender)}`);
  assert(!kept.warnings.some((w) => /otherGender/.test(w.at)), `a warning on a right one: ${JSON.stringify(kept.warnings.filter((w) => /otherGender/.test(w.at)))}`);
  const refusals = [
    ["the sentence itself", (it) => (it.otherGender = { text: "Um café, obrigado.", gender: "f", who: "speaker" })],
    ["one of its wrong versions", (it) => (it.otherGender = { text: it.wrong[0], gender: "f", who: "speaker" })],
    ["a gender that isn't f or m", (it) => (it.otherGender = { text: "Um café, obrigada.", gender: "woman", who: "speaker" })],
    ["a who that isn't speaker or listener", (it) => (it.otherGender = { text: "Um café, obrigada.", gender: "f", who: "me" })],
    ["no text", (it) => (it.otherGender = { gender: "f", who: "speaker" })],
    ["not an object", (it) => (it.otherGender = "Um café, obrigada.")],
  ];
  for (const [what, mutate] of refusals) {
    const result = checked(mutate);
    assert(!result.pack && result.errors.some((e) => /otherGender/.test(e.at)), `${what}: not refused (${JSON.stringify(result.errors.slice(0, 1))})`);
  }
  const extra = checked((it) => (it.otherGender = { text: "Um café, obrigada.", gender: "f", who: "speaker", note: "x" }));
  assert(extra.pack && extra.warnings.some((w) => /otherGender/.test(w.at)), "a key otherGender doesn't take: no warning");
});

await test("your AI's form (pack-authoring.js) carries otherGender there and back, and the pack's check holds it", async () => {
  const { authoringItem, storedItem } = await from("public/js/study/pack-authoring.js");
  const one = checkPack(basePack(), { installed: [] }).pack.items.find((it) => it.id === "um-cafe-obrigado");
  const form = authoringItem(one, "pt");
  assert(JSON.stringify(form.otherGender) === JSON.stringify(one.otherGender), `the form has ${JSON.stringify(form.otherGender)}`);
  const back = storedItem(form, { language: "pt" });
  assert(back.item && JSON.stringify(back.item.otherGender) === JSON.stringify(one.otherGender), `back: ${JSON.stringify(back.item?.otherGender)} ${JSON.stringify(back.problems)}`);
});

// ---------- typed from the English ----------
await test("Portuguese: from the English, the other gender's sentence typed is right (Um café, obrigada.; Eu sou professora.; Você é uma boa amiga.), shown as typed, every word known", async () => {
  await learning("pt");
  for (const [id, text] of [["um-cafe-obrigado", "Um café, obrigada."], ["eu-sou-professor", "Eu sou professora."], ["voce-e-um-bom-amigo", "Você é uma boa amiga."]]) {
    const it = item(id);
    right(it, text);
    const result = typedResult(it, text, true, { fromEnglish: true });
    assert(/obrigada|professora|uma boa amiga/i.test(shownWords(result)), `shown as "${shownWords(result)}", not as typed`);
    const outcomes = wordOutcomes(it.words, result);
    const lemmas = it.words.filter(([, lemma]) => lemma).map(([, lemma]) => lemma);
    assert(lemmas.every((lemma) => outcomes[lemma] === "right"), `evidence ${JSON.stringify(outcomes)} for ${lemmas.join(", ")}`);
  }
});

await test("the controls: a near miss of the other gender's sentence, the other gender's from what's heard, and a sentence with no otherGender stay wrong", async () => {
  await learning("pt");
  wrong(item("um-cafe-obrigado"), "Um café, obrigade.");
  wrong(item("um-cafe-obrigado"), "Um café, obrigada.", { fromEnglish: false });
  // A sentence with no otherGender (made here, so a pack's next version can't give it one).
  wrong(made([["Muito", "muito"], ["obrigado", "obrigado"]], ".", "Thank you very much."), "Muito obrigada.");
  right(item("um-cafe-obrigado"), "Um café, obrigado.");
});

await test("Spanish (listener): ¿Estás lista? right from ¿Estás listo?'s English; Italian: Sono un'insegnante. right, its words not lining up one for one, every word of the sentence known", async () => {
  await learning("es");
  right(item("l008-1"), "¿Estás lista?");
  await learning("it");
  const it = item("sono-un-insegnante");
  right(it, "Sono un'insegnante.");
  const result = typedResult(it, "Sono un'insegnante.", true, { fromEnglish: true });
  const outcomes = wordOutcomes(it.words, result);
  assert(it.words.filter(([, l]) => l).every(([, l]) => outcomes[l] === "right"), `evidence ${JSON.stringify(outcomes)}`);
  assert(/un'insegnante/.test(shownWords(result)), `shown as "${shownWords(result)}"`);
});

await test("a sentence written in the other gender gets the first one back: Ukrainian's Я вчителька. takes Я вчитель.", async () => {
  await learning("uk");
  right(item("item-18"), "Я вчитель.");
});

await test("Thai, written without spaces: the other gender's sentence typed whole is right (ผมดื่มชา → ฉันดื่มชา; a question's คะ), and the pack's two Hello. sentences (ครับ, ค่ะ) each right from the other's English", async () => {
  await learning("th");
  right(item("item-2"), "ฉันดื่มชา");
  right(item("item-20"), "ดื่มชาไหมคะ");
  wrong(item("item-2"), "ฉันดื่มนม");
  wrong(item("item-2"), "ฉันดื่มชา", { fromEnglish: false });
  right(item("hello-man"), "สวัสดีค่ะ");
  right(item("hello-woman"), "สวัสดีครับ");
});

// ---------- said from the English ----------
await test("said from its English (Say it): the matcher with the other gender's sentence among its targets, the result shown as said, every word known", async () => {
  await learning("pt");
  const it = item("um-cafe-obrigado");
  const variants = [...subjects.subjectVariants(it, { lang: "pt", items: content.ITEMS }), ...subjects.sameEnglishVariants(it, { items: content.ITEMS, textOf: content.sentence }), ...(subjects.genderVariants?.(it) ?? [])];
  assert(variants.some((one) => one.text === "Um café, obrigada."), `no variant for the other gender: ${JSON.stringify(variants.map((one) => one.text))}`);
  const heard = subjects.asWritten(match(content.sentence(it), "um café obrigada", { lang: "pt", accept: variants.map((one) => one.text) }), variants, it);
  assert(heard?.ok, `said "um café obrigada": ${JSON.stringify(heard)}`);
  assert(/obrigada/.test(heard.words.map((w) => w.heard ?? w.text).join(" ")), `shown as ${JSON.stringify(heard.words)}`);
  const outcomes = wordOutcomes(it.words, heard, { spoken: true });
  assert(it.words.filter(([, l]) => l).every(([, l]) => outcomes[l] === "right"), `evidence ${JSON.stringify(outcomes)}`);
});

// ---------- never a tile ----------
await test("otherGender is read only by the pack's check, your AI's form, the grading and the answer's drawer: no other file under public/js names it", () => {
  const ALLOWED = new Set(["js/study/pack-format.js", "js/study/pack-items.js", "js/study/pack-authoring.js", "js/study/subjects.js", "js/study/learn-more.js"]);
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.js$/.test(name) && /\botherGender\b/.test(readFileSync(path, "utf8"))) found.push(relative(join(APP, "public"), path));
    }
  };
  walk(join(APP, "public/js"));
  const stray = found.filter((one) => !ALLOWED.has(one));
  assert(stray.length === 0, `otherGender read in ${stray.join(", ")}`);
  assert(found.includes("js/study/subjects.js") && found.includes("js/study/learn-more.js"), `the grading and the drawer don't read it (${found.join(", ")})`);
  // The scan can fail: a planted reader is caught.
  assert(/\botherGender\b/.test("const tiles = item.otherGender.text.split(' ');"), "the scan's pattern misses a planted reader");
});

await test("no lesson, Practice or game a starter plans offers the other gender's sentences (starter-pt: Um café, obrigada.; Eu sou professora.; starter-th: ฉันดื่มชา) but as the item's own field", async () => {
  // Whole sentences, not their words: a word like professora is also in the pack's own sentences.
  for (const [lang, words] of [["pt", ["Um café, obrigada.", "Eu sou professora.", "Você é uma boa amiga."]], ["th", ["ฉันดื่มชา", "ดื่มชาไหมคะ"]]]) {
    await learning(lang);
    const lessons = content.LESSONS ?? [];
    const plans = [];
    for (const lesson of lessons.filter((one) => one.id.startsWith(`starter-${lang}`) || !one.id.includes("/"))) plans.push(plan.planSession("lesson", lesson.id, Date.now()));
    plans.push(plan.planSession("practice", undefined, Date.now()));
    for (const game of Object.keys(plan.GAMES ?? {})) plans.push(plan.planSession("game", game, Date.now()));
    assert(plans.length >= 3, `only ${plans.length} plans`);
    // Every place a plan holds the other gender's words: only a step's item carrying its own otherGender, never a tile, choice or option.
    const places = [];
    const find = (value, path) => {
      if (typeof value === "string") return void (words.some((word) => value.includes(word)) && places.push(path));
      if (Array.isArray(value)) value.forEach((one, i) => find(one, `${path}[${i}]`));
      else if (value && typeof value === "object") for (const [key, one] of Object.entries(value)) find(one, `${path}.${key}`);
    };
    plans.forEach((one, i) => find(one, `plan${i}`));
    const stray = places.filter((path) => !/\.item\.otherGender\.text$/.test(path));
    assert(places.length > 0, "no plan holds a sentence with otherGender at all: the scan sees nothing");
    assert(stray.length === 0, `offered outside the item's own field: ${stray.slice(0, 4).join(", ")}`);
  }
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
