// A sentence typed or said from its English, where the language leaves its subject to the verb (study/subjects.js, lang/subjects.js):
// right with its subject pronoun said or left out, at a clause's start (the sentence's, or after a leading "Sí," / "No, gracias,"),
// only as the verb's own person, the one the English names. Through Type it's grading (study/typed.js typedResult, from the English) on
// the real packs: Spanish's lessons, the Italian and Portuguese starters. Each way in each language; the result shown on the sentence
// as written (a pronoun left out in its place, no evidence for it; one added taken out); and the controls that stay wrong: another
// person (Él tomo, Lui bevo), a polite form left out (usted, Lei, o senhor), a pronoun dropped in mid-sentence (y yo tomo, e io no),
// and dictation (what's heard is the very sentence). Said (Say it from its English): the matcher with the same variants.
//   node scripts/test-subjects.mjs [<app dir>]   another copy's dir to see it fail on one from before (exit 0 = pass)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
const { savePack } = await from("public/js/study/packs.js");
const { setLearning } = await from("public/js/study/learning.js");
const content = await from("public/js/study/content.js");
const { typedResult } = await from("public/js/study/typed.js");
const { typedRight, wordOutcomes } = await from("public/js/study/attribute.js");
const { match } = await from("public/js/speech/match.js");
const subjects = await from("public/js/study/subjects.js").catch(() => null);

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
for (const name of ["path-es.json", "starter-it.json", "starter-pt.json", "path-nl.json"]) {
  const saved = await savePack(read(name));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
async function learning(lang) {
  setLearning(lang);
  await new Promise((done) => setTimeout(done, 20));
  assert(content.ITEMS.length && content.contentLanguage() === lang, `no ${lang} sentences on the device`);
}
const item = (id) => {
  const found = content.ITEMS.find((one) => one.id.endsWith(`/${id}`));
  assert(found, `no sentence ${id}`);
  return found;
};
// Typed from its English (Type it's default), forgiving accents and strict, as the game grades it.
const typed = (it, text, options = { fromEnglish: true }) => [true, false].map((forgiving) => typedResult(it, text, forgiving, options));
const right = (it, text, options) => typed(it, text, options).forEach((result, i) => assert(typedRight(result), `"${text}" for "${content.sentence(it)}" (${it.means}) should be right${i ? " with accents strict" : ""}: ${JSON.stringify(result.words.map((w) => [w.text, w.result]))}`));
const wrong = (it, text, options) => typed(it, text, options).forEach((result, i) => assert(!typedRight(result), `"${text}" for "${content.sentence(it)}" (${it.means}) should be wrong${i ? " with accents strict" : ""}`));
// A sentence not in any pack (the controls the packs here haven't got), as an item reads.
const made = (words, punct, means) => ({ id: "made/1", words, punct, means });

await test("the module is there: study/subjects.js", () => assert(subjects, "no public/js/study/subjects.js in this copy"));

await test("Spanish: a subject said or left out at the sentence's start, as the English's person (Tomo café · Yo tomo café · Él tiene · ¿Él toma? · Él no toma)", async () => {
  await learning("es");
  right(item("l000-1"), "Yo tomo café.");
  right(item("l000-1"), "Tomo café.");
  right(item("l000-3"), "Tomo agua.");
  right(item("l000-3"), "Yo tomo agua.");
  right(item("l009-3"), "Tiene mi teléfono.");
  right(item("l009-10"), "¿Toma café?");
  right(item("idea-negation-2"), "No toma té.");
});

await test("Spanish: after a leading word set off by a comma (No, gracias, tomo agua · No, gracias, yo tomo agua)", async () => {
  await learning("es");
  right(item("l002-7"), "No, gracias, yo tomo agua.");
  right(item("l002-7"), "No, gracias, tomo agua.");
});

await test("Spanish, the controls: another person, usted left out, a pronoun dropped after y or pero, the pronoun in the wrong place, dictation", async () => {
  await learning("es");
  wrong(item("l000-1"), "Él tomo café.");
  wrong(item("l000-1"), "Tú tomo café.");
  wrong(item("l010-1"), "Él viene a mi casa.");
  wrong(item("l013-4"), "¿Sabe qué es esto?");
  wrong(item("l008-4"), "Tú tomas café y tomo té.");
  wrong(item("l011-4"), "Yo quiero café, pero quiere agua.");
  wrong(item("l008-3"), "No yo tomo café.");
  wrong(item("l000-3"), "Tomo agua yo.");
  wrong(item("l000-1"), "Yo tomo café.", { fromEnglish: false });
  wrong(item("l000-3"), "Tomo agua.", { fromEnglish: false });
});

await test("Spanish: before también or todavía, and after (or before) entonces, said or left out (¿Tú también quieres café? · ¿También quieres café?; Todavía tengo · Yo todavía tengo; Entonces voy · Entonces yo voy · Yo entonces voy)", async () => {
  await learning("es");
  right(item("l011-6"), "¿También quieres café?");
  right(item("l010-8"), "También toma café con leche.");
  right(item("l011-11"), "También queremos un café.");
  right(item("l011-2"), "Nosotros también queremos comer.");
  right(item("l014-1"), "Yo todavía tengo que trabajar.");
  right(item("l014-9"), "Yo todavía no estoy en casa.");
  right(item("l015-7"), "Entonces yo voy a casa de mi papá.");
  right(item("l015-7"), "Yo entonces voy a casa de mi papá.");
});

await test("Spanish, the widening's controls: another person before todavía, a pronoun after the verb at the end, a pronoun after también", async () => {
  await learning("es");
  wrong(item("l014-1"), "Tú todavía tengo que trabajar.");
  wrong(item("l011-2"), "Él también queremos comer.");
  wrong(item("l012-3"), "¿Qué quieres hacer tú?");
  wrong(item("l011-6"), "¿También tú quieres café?");
});

await test("Italian: Bevo caffè · Io bevo caffè; Io bevo acqua · Bevo acqua; Tu sei uno studente · Sei uno studente; Sei un insegnante? · Tu sei un insegnante?", async () => {
  await learning("it");
  right(item("bevo-caffe"), "Io bevo caffè.");
  right(item("io-bevo-acqua"), "Bevo acqua.");
  right(item("tu-sei-uno-studente"), "Sei uno studente.");
  right(item("sei-un-insegnante"), "Tu sei un insegnante?");
  right(item("arrivata-stazione"), "È arrivata alla stazione.");
});

await test("Italian, the controls: Lui bevo, Lei bevo; the polite Lei never left out (its English is you); io no and e io after another clause stay; anche io keeps its io", async () => {
  await learning("it");
  wrong(item("bevo-caffe"), "Lui bevo caffè.");
  wrong(item("bevo-caffe"), "Lei bevo caffè.");
  wrong(made([["Lei", "lei"], ["vuole", "volere"], ["un", "uno"], ["caffè", "caffè"]], "?", "Do you want a coffee?"), "Vuole un caffè?");
  wrong(made([["Tu", "tu"], ["sei", "essere"], ["pronto", "pronto"], ["e", "e"], ["io", "io"], ["no", "no"]], ".", "You're ready and I'm not."), "Tu sei pronto e no.");
  wrong(made([["Lui", "lui"], ["beve", "bere"], ["tè", "tè"], ["e", "e"], ["io", "io"], ["bevo", "bere"], ["caffè", "caffè"]], ".", "He drinks tea and I drink coffee."), "Lui beve tè e bevo caffè.");
  // anche binds to its pronoun: Anche io vengo, never Anche vengo.
  wrong(made([["Anche", "anche"], ["io", "io"], ["vengo", "venire"], ["a", "a"], ["casa", "casa"]], ".", "I am coming home too."), "Anche vengo a casa.");
});

// A subject the sentence already says, anywhere, is never said again at its start: each case its as-written right, its doubled one wrong,
// and no variant of it with that person's pronoun twice; beside each language, a control with no pronoun that still takes one.
const saysTwice = (lang, it) => {
  const table = { it: ["io", "tu", "lui", "lei", "noi"], es: ["yo", "tú", "él", "ella", "nosotros", "nosotras"], pt: ["eu", "você", "ele", "ela", "nós"] }[lang];
  return subjects.subjectVariants(it, { lang, items: content.ITEMS }).filter((one) => {
    const said = one.text.toLocaleLowerCase().split(/[^\p{L}]+/u).filter((word) => table.includes(word));
    return new Set(said).size < said.length;
  });
};
const sayOnce = (lang, words, punct, means, doubled) => {
  const it = made(words, punct, means);
  right(it, content.sentence(it));
  wrong(it, doubled);
  const twice = saysTwice(lang, it);
  assert(!twice.length, `"${content.sentence(it)}" given ${twice.map((one) => `"${one.text}"`).join(", ")}`);
};

await test("a subject the sentence already says isn't said again: Italian (Vieni anche tu? never Tu vieni anche tu?, the path's six; Pago io; Vengo anch'io), with Vieni qui? · Tu vieni qui? as the control", async () => {
  await learning("it");
  right(made([["Vieni", "venire"], ["qui", "qui"]], "?", "Are you coming here?"), "Tu vieni qui?");
  sayOnce("it", [["Vieni", "venire"], ["anche", "anche"], ["tu", "tu"]], "?", "Are you coming too?", "Tu vieni anche tu?");
  sayOnce("it", [["Viene", "venire"], ["anche", "anche"], ["lei", "lei"]], "?", "Is she coming too?", "Lei viene anche lei?");
  sayOnce("it", [["Vogliamo", "volere"], ["mangiare", "mangiare"], ["anche", "anche"], ["noi", "noi"]], ".", "We want to eat too.", "Noi vogliamo mangiare anche noi.");
  sayOnce("it", [["Vuoi", "volere"], ["anche", "anche"], ["tu", "tu"], ["un", "uno"], ["caffè", "caffè"]], "?", "Do you want a coffee too?", "Tu vuoi anche tu un caffè?");
  sayOnce("it", [["Vuoi", "volere"], ["leggere", "leggere"], ["il", "il"], ["libro", "libro"], ["anche", "anche"], ["tu", "tu"]], "?", "Do you want to read the book too?", "Tu vuoi leggere il libro anche tu?");
  sayOnce("it", [["Devi", "dovere"], ["lavorare", "lavorare"], ["anche", "anche"], ["tu", "tu"]], "?", "Do you have to work too?", "Tu devi lavorare anche tu?");
  sayOnce("it", [["Pago", "pagare"], ["io", "io"]], ".", "I'll pay.", "Io pago io.");
  sayOnce("it", [["Vengo", "venire"], ["anch'io", "anche"]], ".", "I'm coming too.", "Io vengo anch'io.");
});

await test("a subject the sentence already says isn't said again: Spanish (¿Vienes tú también?, ¿Quieres café tú también?, Pago yo), with ¿Vienes aquí? · ¿Tú vienes aquí? as the control", async () => {
  await learning("es");
  right(made([["¿Vienes", "venir"], ["aquí", "aquí"]], "?", "Are you coming here?"), "¿Tú vienes aquí?");
  sayOnce("es", [["¿Vienes", "venir"], ["tú", "tú"], ["también", "también"]], "?", "Are you coming too?", "¿Tú vienes tú también?");
  sayOnce("es", [["¿Quieres", "querer"], ["café", "café"], ["tú", "tú"], ["también", "también"]], "?", "Do you want coffee too?", "¿Tú quieres café tú también?");
  sayOnce("es", [["Pago", "pagar"], ["yo", "yo"]], ".", "I'll pay.", "Yo pago yo.");
});

await test("a subject the sentence already says isn't said again: Portuguese (Vem você também?, Pago eu), with Vem também? · Você vem também? as the control", async () => {
  await learning("pt");
  right(made([["Vem", "vir"], ["também", "também"]], "?", "Are you coming too?"), "Você vem também?");
  sayOnce("pt", [["Vem", "vir"], ["você", "você"], ["também", "também"]], "?", "Are you coming too?", "Você vem você também?");
  sayOnce("pt", [["Pago", "pagar"], ["eu", "eu"]], ".", "I'll pay.", "Eu pago eu.");
});

await test("Portuguese: Bebo café · Eu bebo café; Eu bebo chá · Bebo chá; Você é estudante · É estudante", async () => {
  await learning("pt");
  right(item("bebo-cafe"), "Eu bebo café.");
  right(item("eu-bebo-cha"), "Bebo chá.");
  right(item("voce-e-estudante"), "É estudante.");
});

await test("Portuguese, the controls: Ele bebo; o senhor never left out", async () => {
  await learning("pt");
  wrong(item("bebo-cafe"), "Ele bebo café.");
  wrong(item("bebo-cafe"), "Ela bebo café.");
  wrong(made([["O", "o"], ["senhor", "senhor"], ["quer", "querer"], ["um", "um"], ["café", "café"]], "?", "Do you want a coffee?"), "Quer um café?");
});

await test("Portuguese: before também or ainda, after então (Eu também quero café · Também quero café; Ainda tenho · Eu ainda tenho; Então vou · Então eu vou)", async () => {
  await learning("pt");
  right(made([["Eu", "eu"], ["também", "também"], ["quero", "querer"], ["café", "café"]], ".", "I want coffee too."), "Também quero café.");
  right(made([["Ainda", "ainda"], ["tenho", "ter"], ["que", "que"], ["trabalhar", "trabalhar"]], ".", "I still have to work."), "Eu ainda tenho que trabalhar.");
  right(made([["Então", "então"], ["vou", "ir"], ["para", "para"], ["casa", "casa"]], ".", "Then I will go home."), "Então eu vou para casa.");
  wrong(made([["Ainda", "ainda"], ["tenho", "ter"], ["que", "que"], ["trabalhar", "trabalhar"]], ".", "I still have to work."), "Ele ainda tenho que trabalhar.");
});

await test("another sentence with the same English, typed exactly from it, is right too: path-nl's five pairs both ways (je and uw, vind and denk, word order)", async () => {
  await learning("nl");
  const pairs = [["l058-2", "l058-12"], ["l062-5", "l062-9"], ["l069-8", "l069-11"], ["l069-8", "l105-6"], ["l069-11", "l105-6"], ["l070-1", "l070-9"], ["l130-1", "l130-9"]];
  for (const [a, b] of pairs) {
    right(item(a), content.sentence(item(b)));
    right(item(b), content.sentence(item(a)));
  }
});

await test("same English, the controls: a near miss of the other sentence, the other sentence by dictation, and no evidence for a word the other hasn't got", async () => {
  await learning("nl");
  wrong(item("l058-2"), "Doet uw mont pijn?");
  wrong(item("l130-1"), "Wat denkt je ervan?");
  wrong(item("l062-5"), "Ik moet leren rijden voor werk.");
  wrong(item("l058-2"), content.sentence(item("l058-12")), { fromEnglish: false });
  const it = item("l058-2");
  const result = typedResult(it, content.sentence(item("l058-12")), true, { fromEnglish: true });
  assert(result.words.map((w) => w.text).join(" ") === it.words.map(([w]) => w.replace(/[?.!,]$/, "")).join(" "), `shown: ${result.words.map((w) => w.text).join(" ")}`);
  const je = it.words.find(([w]) => w.toLowerCase() === "je");
  assert(je && result.words[it.words.indexOf(je)].optional === true, `je not marked optional: ${JSON.stringify(result.words)}`);
  assert(!(je[1] in wordOutcomes(it.words, result)), `evidence for ${je[1]}: ${JSON.stringify(wordOutcomes(it.words, result))}`);
});

await test("the result is the sentence as written: a pronoun left out shown in its place, right and no evidence for it; one added taken out", async () => {
  await learning("es");
  const left = typedResult(item("l000-3"), "Tomo agua.", true, { fromEnglish: true });
  assert(left.words.map((w) => w.text).join(" ") === "Yo tomo agua", `left out: ${left.words.map((w) => w.text).join(" ")}`);
  assert(left.words[0].result === "right" && left.words[0].optional === true, `left out, its place: ${JSON.stringify(left.words[0])}`);
  const outcomes = wordOutcomes(item("l000-3").words, left);
  assert(!("yo" in outcomes) && outcomes.tomar === "right" && outcomes.agua === "right", `left out, the evidence: ${JSON.stringify(outcomes)}`);
  const added = typedResult(item("l000-1"), "Yo tomo café.", true, { fromEnglish: true });
  assert(added.words.map((w) => w.text).join(" ") === "Tomo café" && added.words.every((w) => w.result === "right"), `added: ${JSON.stringify(added.words)}`);
  assert(JSON.stringify(wordOutcomes(item("l000-1").words, added)) === JSON.stringify({ tomar: "right", "café": "right" }), `added, the evidence: ${JSON.stringify(wordOutcomes(item("l000-1").words, added))}`);
  // A pronoun said where the sentence says it: the result as before, nothing optional.
  const same = typedResult(item("l000-3"), "Yo tomo agua.", true, { fromEnglish: true });
  assert(same.words.every((w) => !w.optional), "a pronoun typed as written marked optional");
});

await test("said from its English (Say it): the recognizer's matcher with the same variants, and the result on the sentence as written", async () => {
  await learning("it");
  assert(subjects, "no study/subjects.js");
  const it = item("io-bevo-acqua");
  const variants = subjects.subjectVariants(it, { lang: "it", items: content.ITEMS });
  const heard = subjects.asWritten(match(content.sentence(it), "bevo acqua", { lang: "it", accept: variants.map((one) => one.text) }), variants, it);
  assert(heard.ok && heard.words.length === it.words.length && heard.words[0].optional, `heard "bevo acqua": ${JSON.stringify(heard.words)}`);
  const other = subjects.asWritten(match(content.sentence(it), "lui bevo acqua", { lang: "it", accept: variants.map((one) => one.text) }), variants, it);
  assert(!other.ok, `heard "lui bevo acqua": right`);
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
