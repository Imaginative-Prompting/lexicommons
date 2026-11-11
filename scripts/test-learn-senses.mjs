// Which of a word's senses a sentence uses (study/learn-senses.js): the senses of its gloss whose words the sentence's word-for-word line has,
// for the list of a sentence's words in the drawer an answer's "?" opens (study/learn-more.js), so a word shows what it means there and not
// its whole dictionary entry. Cases from the packs themselves, each with what a rule that showed the whole entry would say (the control),
// then the real Dutch packs: how often one sense is found, and that what's found is always among the word's own senses.
// Usage: node scripts/test-learn-senses.mjs   (exit 0 = pass)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pictureFits, sensesIn, sentenceSenses, useWordsTaught } from "../public/js/study/learn-senses.js";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (name, fn) => {
  try {
    const detail = fn();
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
};
const same = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const NAAR = "to, toward; at; for; like (taste, smell); unpleasant, nasty";
check("naar in \"Tomorrow go we to grandma\" is to, toward; not the whole entry (the control)", () => {
  const got = sensesIn(NAAR, "Tomorrow go we to grandma");
  same(got, ["to, toward"], "naar");
  if (got.join("; ") === NAAR) throw new Error("the whole entry");
});
check("naar meaning nasty: the sense the line has, from the end of the entry", () => same(sensesIn(NAAR, "The weather is nasty"), ["unpleasant, nasty"], "naar"));
check("nothing the line has: no sense (the drawer then says how many it has)", () => same(sensesIn(NAAR, "Can you in that direction point"), [], "naar"));
check("a verb's to drops (to drink: drink), and its English forms count: drinks, drank, are for to be", () => {
  same(sensesIn("to drink", "He drinks the tea"), ["to drink"], "drinks");
  same(sensesIn("to drink", "I drank coffee"), ["to drink"], "drank");
  same(sensesIn("to be; his, its", "Are you again awake so early"), ["to be"], "zijn as are");
  same(sensesIn("to try", "I tried it"), ["to try"], "tried");
  same(sensesIn("to stop, to quit; to put, to stuff (into something)", "Why must we here stop"), ["to stop, to quit"], "stoppen");
});
check("a parenthesis isn't part of the sense: like (taste, smell) is like", () => same(sensesIn(NAAR, "That smells like fish"), ["like (taste, smell)"], "naar as like"));
check("in a sentence, a line word another word's only sense takes isn't this one's too: ze in \"She is happy with her work\" is she (haar has her)", () => {
  const got = sentenceSenses(["she; her; they; them; it (referring to a feminine noun); side", "to be", "happy", "with", "her; hair", "work"], "She is happy with her work");
  same(got[0], ["she"], "ze");
  // The control: alone, both she and her are in the line.
  same(sensesIn("she; her; they; them; it (referring to a feminine noun); side", "She is happy with her work"), ["she", "her"], "ze alone");
});
check("a sense inside a longer one the line also has gives way: thuis in \"Are you at home\" is at home", () => same(sentenceSenses(["at home; home"], "Are you at home because you off are")[0], ["at home"], "thuis"));
check("zijn in \"His dog\" is his, its: the sense the line has, though it isn't the first", () => same(sentenceSenses(["to be; his, its"], "His dog")[0], ["his, its"], "zijn as his"));

check("the Dutch packs: a word of several senses gets one in at least 85 of 100 of its sentences, none in under 8, and only ever its own senses", () => {
  const files = ["path-nl.json", ...readdirSync(join(APP, "packs")).filter((f) => /^words-nl-\d+\.json$/.test(f))];
  const words = {};
  const items = [];
  for (const f of files) {
    const pack = JSON.parse(readFileSync(join(APP, "packs", f), "utf8"));
    Object.assign(words, pack.words);
    items.push(...pack.items.filter((item) => item.words?.length && item.literal?.length));
  }
  let several = 0;
  let one = 0;
  let none = 0;
  for (const item of items) {
    const literal = item.literal.map(([text]) => text).join(" ");
    const got = sentenceSenses(item.words.map(([, lemma]) => words[lemma] ?? null), literal);
    item.words.forEach(([, lemma], at) => {
      const gloss = words[lemma];
      if (!gloss?.includes(";")) return;
      several++;
      const own = gloss.split(";").map((sense) => sense.trim());
      for (const sense of got[at]) {
        if (!own.includes(sense)) throw new Error(`${lemma}: "${sense}" isn't one of its senses`);
        if (sensesIn(sense, literal).length !== 1) throw new Error(`${lemma}: "${sense}" isn't in "${literal}"`);
      }
      if (got[at].length === 1) one++;
      else if (!got[at].length) none++;
    });
  }
  if (one / several < 0.85) throw new Error(`one sense in ${((one / several) * 100).toFixed(1)}%`);
  if (none / several > 0.08) throw new Error(`none in ${((none / several) * 100).toFixed(1)}%`);
  return `${several} words of several senses in ${items.length} sentences: one in ${((one / several) * 100).toFixed(1)}%, none in ${((none / several) * 100).toFixed(1)}%`;
});

// A lesson's drawing beside a sentence only where the sentence uses the sense the lesson teaches (learn-more.js's word page): on the real Dutch
// packs, each word in the first lesson that gives it a picture, its own sentences there, and a word pack's card that uses another sense.
check("a lesson's drawing fits its own sentences and not a card of another sense: halen, stuk, band, kaart on the real Dutch packs", () => {
  const path = JSON.parse(readFileSync(join(APP, "packs", "path-nl.json"), "utf8"));
  const words = { ...path.words };
  const cards = [];
  for (const f of readdirSync(join(APP, "packs")).filter((f) => /^words-nl-\d+\.json$/.test(f))) {
    const pack = JSON.parse(readFileSync(join(APP, "packs", f), "utf8"));
    Object.assign(words, pack.words);
    cards.push(...pack.items.filter((item) => item.words?.length));
  }
  const fits = (item, lemma, means) => {
    const at = item.words.findIndex(([, word]) => word === lemma);
    if (at < 0) throw new Error(`${lemma} isn't in "${item.words.map(([text]) => text).join(" ")}"`);
    return pictureFits(item.words.map(([, word]) => words[word] ?? null), item.literal.map(([text]) => text).join(" "), at, means);
  };
  const said = [];
  for (const [lemma, picture, other] of [
    ["halen", "fetch", "Vandaag haalden we de trein op het nippertje"],
    ["stuk", "broken", "Vandaag is mijn humeur een stuk beter"],
    ["band", "tire", "Mijn zus repeteert elke week met haar band"],
    ["kaart", "card", "We moeten deze kaart goed bestuderen"],
  ]) {
    const lesson = path.lessons.find((one) => one.words?.some((word) => word.lemma === lemma));
    const word = lesson.words.find((one) => one.lemma === lemma);
    same(word.picture, picture, `${lemma}'s picture in ${lesson.id}`);
    const own = lesson.items.map((id) => path.items.find((item) => item.id === id)).filter((item) => item?.words.some(([, w]) => w === lemma));
    if (!own.length) throw new Error(`${lesson.id} has no sentence with ${lemma}`);
    for (const item of own) if (!fits(item, lemma, word.means)) throw new Error(`${lemma}: its lesson's own "${item.words.map(([text]) => text).join(" ")}" doesn't fit`);
    const card = cards.find((item) => item.words.map(([text]) => text).join(" ") === other);
    if (!card) throw new Error(`no card "${other}"`);
    if (fits(card, lemma, word.means)) throw new Error(`${lemma}: ${picture} fits "${other}"`);
    said.push(`${lemma}: ${picture} on ${lesson.id}'s ${own.length}, not "${other}"`);
  }
  return said.join("; ");
});

// A gloss of one sense fits only when that sense is the lesson's. The view takes a word's gloss from the first pack that has one, a starter's
// before the path's: starter-de's zu is "to", not path-de l014's "too" (its picture the overflowing cup), and path-es's que is "that", not
// l014's tener que "to have to". Each picture planted here as it's drawn, whether the pack carries it today or not (zu's was taken off until
// this held, 9 Nov 2026; que's comes after it). Each lesson's own sentences fit by their words too.
check("a gloss of one sense that isn't the lesson's sense: no picture (de zu on \"Ich gehe zur Schule.\", es que on l015-9), the lessons' own sentences fit", () => {
  const said = [];
  for (const [lang, lemma, card, picture, lessonId] of [["de", "zu", "Ich gehe zur Schule", "too-much", "l014"], ["es", "que", "Mi mamá dice que sí", "must", "l014"]]) {
    const packs = [`starter-${lang}.json`, `path-${lang}.json`].map((f) => JSON.parse(readFileSync(join(APP, "packs", f), "utf8")));
    const words = {};
    for (const pack of packs) for (const [k, v] of Object.entries(pack.words ?? {})) if (!Object.hasOwn(words, k)) words[k] = v;
    const path = packs[1];
    const lesson = path.lessons.find((one) => one.id === lessonId && one.words?.some((word) => word.lemma === lemma));
    if (!lesson) throw new Error(`${lang}: ${lessonId} doesn't teach ${lemma}`);
    const word = lesson.words.find((one) => one.lemma === lemma);
    const fits = (item) => {
      const at = item.words.findIndex(([, w]) => w === lemma);
      return pictureFits(item.words.map(([, w]) => words[w] ?? null), item.literal.map(([text]) => text).join(" "), at, word.means);
    };
    const all = packs.flatMap((pack) => pack.items);
    const theCard = all.find((item) => item.words.map(([text]) => text).join(" ").replace(/[.?!]/g, "") === card);
    if (!theCard) throw new Error(`${lang}: no card "${card}"`);
    if (fits(theCard)) throw new Error(`${lang} ${lemma}: ${picture} fits "${card}" (the view's gloss "${words[lemma]}", the lesson's "${word.means}")`);
    const own = lesson.items.map((id) => path.items.find((item) => item.id === id)).filter((item) => item?.words.some(([, w]) => w === lemma));
    for (const item of own) if (!fits(item)) throw new Error(`${lang} ${lemma}: its lesson's own "${item.words.map(([text]) => text).join(" ")}" doesn't fit`);
    said.push(`${lang} ${lemma} ("${words[lemma]}"): none on "${card}", ${lesson.id}'s ${own.length} fit`);
  }
  return said.join("; ");
});

check("a lesson's drawing for HAVE, BE or \"no\" (the word-for-word line writes every use alike) beside a sentence only where the sentence's English uses it as the lesson's own do: real sentences of each kind, today's gate (no English given) showing them all", () => {
  const CASES = [
    ["nl", "hebben", "l004", ["Ik heb nu tijd", "Heb je een afspraak met de dokter", "Mijn zus heeft veel boeken"], { perfect: ["Ik heb die film meermaals gezien", "Heb je de ouders al gebeld", "Wat heb je vandaag gegeten", "Een wesp heeft me gestoken"], hunger: ["Ik neem een plak omdat ik honger heb"], need: ["Welk materiaal heb je nodig"], "feel like": ["Heb je zin om te koken"] }],
    ["fr", "avoir", "l004", ["J'ai une voiture", "Je n'ai pas de livre"], { perfect: ["Je l'ai vu hier", "Tu as fini tes devoirs", "J'ai mangé une pizza hier soir"], age: ["Mon frère a vingt ans"], hunger: ["J'ai faim, et toi"], thirst: ["Tu as soif"], "there is": ["Il y a deux salles de bain", "Il n'y a pas de lait"] }],
    ["es", "tener", "l004", ["Tengo un coche", "No tengo dinero"], { age: ["Mi hermano tiene veinte años"], hunger: ["Mi hijo siempre tiene hambre"], thirst: ["¿Tienes sed"], obligation: ["Todavía tengo que trabajar"] }],
    ["it", "avere", "l004", ["Ho una macchina", "Non ho denaro"], { age: ["Mio fratello ha venti anni"], hunger: ["Ho fame, e tu"], thirst: ["Hai sete"] }],
    ["de", "haben", "l004", ["Ich habe ein Auto", "Hast du einen Bruder"], { delay: ["Ich komme zu spät, weil der Zug Verspätung hat"] }],
    ["pt", "ter", "l004", ["Eu tenho um carro", "Eu não tenho dinheiro"], { obligation: ["Eu tenho que ir agora", "Amanhã eu tenho que trabalhar"], "there is": ["Tem dois banheiros no apartamento", "Não tem pão em casa", "Tem um banco aqui perto"] }],
    ["ru", "нет", "l002", ["Нет, телефон в машине", "Нет, спасибо. До свидания"], { "there isn't": ["В холодильнике нет молока"], "don't have": ["Сегодня у меня нет времени", "У меня нет работы"] }],
    ["ru", "быть", "l014", ["У меня есть телефон", "У тебя есть ключ"], { past: ["Я никогда не был в России"], future: ["Завтра будет дождь", "Надеюсь, завтра будет хорошая погода"] }],
  ];
  const said = [];
  for (const [lang, lemma, lessonId, shown, hidden] of CASES) {
    const files = readdirSync(join(APP, "packs")).filter((f) => new RegExp(`^(starter|path)-${lang}\\.json$|^words-${lang}-\\d+\\.json$`).test(f));
    const order = (f) => (f.startsWith("starter-") ? 0 : f.startsWith("path-") ? 1 : 2);
    const packs = files.sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((f) => JSON.parse(readFileSync(join(APP, "packs", f), "utf8")));
    const words = {};
    for (const pack of packs) for (const [k, v] of Object.entries(pack.words ?? {})) if (!Object.hasOwn(words, k)) words[k] = v;
    const path = packs.find((pack) => pack.id === `path-${lang}`);
    const lesson = path.lessons.find((one) => one.id === lessonId);
    const word = lesson?.words.find((one) => one.lemma === lemma);
    if (!word) throw new Error(`${lang}: ${lessonId} doesn't teach ${lemma}`);
    const lineOf = (item) => item.literal.map(([text]) => text).join(" ");
    const ownItems = lesson.items.map((id) => path.items.find((item) => item.id === id)).filter((item) => item?.words.some(([, w]) => w === lemma));
    const ownLines = ownItems.map((item) => ({ means: item.means ?? "", literal: lineOf(item) }));
    const all = packs.flatMap((pack) => pack.items ?? []);
    const find = (text) => {
      const item = all.find((one) => one.words?.map(([t]) => t).join(" ").replace(/[.?!]+$/, "") === text);
      if (!item) throw new Error(`${lang}: no sentence "${text}"`);
      return item;
    };
    const fits = (item, withEnglish = true) => {
      const at = item.words.findIndex(([, w]) => w === lemma);
      if (at < 0) throw new Error(`${lang}: "${item.words.map(([t]) => t).join(" ")}" has no ${lemma}`);
      return pictureFits(item.words.map(([, w]) => words[w] ?? null), lineOf(item), at, word.means, withEnglish ? { means: item.means ?? "", lesson: ownLines } : {});
    };
    for (const item of ownItems) if (!fits(item)) throw new Error(`${lang} ${lemma}: its lesson's own "${item.means}" doesn't fit`);
    for (const text of shown) if (!fits(find(text))) throw new Error(`${lang} ${lemma}: "${text}" ("${find(text).means}") is the lesson's use, and doesn't fit`);
    let kinds = 0;
    for (const [kind, texts] of Object.entries(hidden))
      for (const text of texts) {
        const item = find(text);
        // Today's gate, reading the word-for-word line alone, shows it: the case is one the English decides.
        if (!fits(item, false)) throw new Error(`${lang} ${lemma}: "${text}" (${kind}) is hidden without its English already, so it tests nothing here`);
        if (fits(item)) throw new Error(`${lang} ${lemma}: "${text}" ("${item.means}", ${kind}) fits`);
        kinds++;
      }
    said.push(`${lang} ${lemma}: ${ownItems.length} own + ${shown.length} shown, ${kinds} hidden (${Object.keys(hidden).join(", ")})`);
  }
  // A lesson's English of another word than these, or a phrase of them ("have to", "lies, is"), is judged as before.
  for (const taught of ["have to", "kunnen = can, be able to", "liegt = lies, is (for something lying down)", "fetch"]) if (useWordsTaught(taught).size) throw new Error(`"${taught}" read as a use word`);
  return said.join("; ");
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
