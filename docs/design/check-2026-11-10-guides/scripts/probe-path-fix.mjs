// lx-app (scratch only): the path fix measured. A pack your AI makes (the Utrecht trip pack, in the AI's form) for a Dutch learner with the path and
// the ten word bands on: new, and 40 lessons in. Where its lessons land, what they teach, whether every one of its sentences can be played once its
// lessons are done (every word taught by then), what the next lesson is, and what Study a topic plays.
//   node probe-path-fix.mjs <app copy> <frequency.nl.json>
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP = resolve(process.argv[2]);
const imp = (p) => import(pathToFileURL(join(APP, p)).href);
await imp("scripts/fixtures/library-grammar.mjs");
const { savePack, deletePack } = await imp("public/js/study/packs.js");
const { useFrequency } = await imp("public/js/study/frequency.js");
const { pathLessons } = await imp("public/js/study/path.js");
const { planSession, markLessonsDone } = await imp("public/js/study/plan.js");
const { clearProgress } = await imp("public/js/study/progress.js");
const { clearPlaces } = await imp("public/js/study/path-place.js");
const { storedItem } = await imp("public/js/study/pack-authoring.js");
const { PACK_FORMAT, PACK_VERSION } = await imp("public/js/study/pack-format.js");
const { lemmasOf } = await imp("public/js/study/new-words.js");

const read = (name) => JSON.parse(readFileSync(join(APP, "packs", name), "utf8"));
for (const name of readdirSync(join(APP, "packs")).filter((n) => /^(path-nl|words-nl-\d+)\.json$/.test(n)).sort()) {
  const saved = await savePack(read(name));
  if (!saved.ok) throw new Error(name);
}
useFrequency(JSON.parse(readFileSync(resolve(process.argv[3]), "utf8")));

const s = (sentence, lemmas, literal, natural, wrong, word, options, patterns, topic = "travel") => ({ sentence, lemmas, literal, natural, wrong, gap: { word, options }, patterns, topic });
const AI = [
  s("De trein heeft vertraging.", { De: "de", trein: "trein", heeft: "hebben", vertraging: "vertraging" }, ["The train", "has", "delay"], "The train is delayed.", ["De trein vertraging heeft."], "vertraging", ["vertraging", "vertragen", "vertraagd"], ["present"]),
  s("Waar is het perron?", { Waar: "waar", is: "zijn", het: "het", perron: "perron" }, ["Where", "is", "the platform"], "Where is the platform?", ["Waar het perron is?"], "perron", ["perron", "perrons", "station"], ["question"]),
  s("Ik koop een kaartje.", { Ik: "ik", koop: "kopen", een: "een", kaartje: "kaartje" }, ["I", "buy", "a ticket"], "I'm buying a ticket.", ["Ik een kaartje koop."], "kaartje", ["kaartje", "kaart", "kaartjes"], ["present"]),
  s("Mijn bagage is te zwaar.", { Mijn: "mijn", bagage: "bagage", is: "zijn", te: "te", zwaar: "zwaar" }, ["My luggage", "is", "too heavy"], "My luggage is too heavy.", ["Mijn bagage zijn te zwaar."], "bagage", ["bagage", "tas", "koffer"], ["present"]),
  s("Het loket is gesloten.", { Het: "het", loket: "loket", is: "zijn", gesloten: "gesloten" }, ["The ticket window", "is", "closed"], "The ticket window is closed.", ["Het loket gesloten is."], "loket", ["loket", "loketten", "kantoor"], ["present"]),
  s("Een retour naar Utrecht, graag.", { Een: "een", retour: "retour", naar: "naar", graag: "graag" }, ["A return", "to Utrecht", "please"], "A return to Utrecht, please.", ["Een retour Utrecht naar, graag."], "retour", ["retour", "enkele reis", "kaartje"], ["question"]),
  s("De conducteur controleert de kaartjes.", { De: "de", conducteur: "conducteur", controleert: "controleren", kaartjes: "kaartje" }, ["The conductor", "checks", "the tickets"], "The conductor checks the tickets.", ["De conducteur de kaartjes controleert."], "conducteur", ["conducteur", "chauffeur", "piloot"], ["present"]),
  s("Ik heb mijn hotel gereserveerd.", { Ik: "ik", heb: "hebben", mijn: "mijn", hotel: "hotel", gereserveerd: "reserveren" }, ["I have", "my hotel", "*booked*"], "I've booked my hotel.", ["Ik heb gereserveerd mijn hotel."], "hotel", ["hotel", "hotels", "huis"], ["perfect"]),
];
const items = [];
const taken = new Set();
for (const input of AI) {
  const { item, problems } = storedItem(input, { language: "nl", taken });
  if (!item) throw new Error(JSON.stringify(problems));
  taken.add(item.id);
  items.push(item);
}
const words = { trein: "train", vertraging: "delay", perron: "platform", kaartje: "ticket", bagage: "luggage", loket: "ticket window", retour: "return ticket", conducteur: "conductor", controleren: "to check", hotel: "hotel", reserveren: "to book", zwaar: "heavy", kopen: "to buy", gesloten: "closed" };
const PACK = { format: PACK_FORMAT, version: PACK_VERSION, id: "trip-utrecht", name: "Trip to Utrecht", language: "nl", from: "en", topics: { travel: "Travel" }, words, items };

async function scenario(name, doneFirst) {
  await clearProgress();
  clearPlaces();
  await deletePack(PACK.id).catch(() => {});
  if (doneFirst) markLessonsDone(pathLessons().filter((lesson) => !lesson.worked && !lesson.full).slice(0, doneFirst));
  const saved = await savePack(PACK, { by: "oauth:Claude", through: 1, change: "pc_probe", applied: "pc_probe" });
  if (!saved.ok) throw new Error(JSON.stringify(saved.errors?.slice(0, 3)));
  const content = await imp("public/js/study/content.js");
  const shown = content.PACKS.find((one) => one.id === PACK.id);
  const wordPack = content.WORD_PACKS.find((one) => one.id === PACK.id);
  console.error(JSON.stringify({ shown: shown && { builtIn: shown.builtIn, origin: shown.origin ?? null, on: shown.on }, wordPack: wordPack && { builtIn: wordPack.builtIn, copies: wordPack.copies, own: wordPack.own, words: wordPack.words.length } }));
  const all = pathLessons();
  const mine = all.map((lesson, i) => ({ i, lesson })).filter(({ lesson }) => lesson.pack === PACK.id);
  const last = mine.at(-1)?.i ?? -1;
  const taughtBy = new Set(all.slice(0, last + 1).flatMap((lesson) => lesson.things.map((thing) => thing.lemma).filter(Boolean)));
  const unreachable = items.filter((item) => !lemmasOf(item).every((lemma) => taughtBy.has(lemma))).map((item) => `${item.id}: ${lemmasOf(item).filter((l) => !taughtBy.has(l)).join(",")}`);
  const next = planSession("lesson");
  const topic = planSession("pack", PACK.id);
  return {
    name,
    pathLessons: all.length,
    first: mine[0]?.i,
    lessons: mine.map(({ i, lesson }) => `#${i} ${lesson.id} [${lesson.things.map((t) => t.lemma ?? t.phrase).join(" ")}] (${lesson.unit?.title})`),
    before: mine[0] ? `${all[mine[0].i - 1]?.id}` : null,
    after: last >= 0 ? `${all[last + 1]?.id}` : null,
    unreachable,
    nextLesson: next.title,
    studyATopic: { title: topic.title, steps: topic.steps.length, empty: topic.empty ?? null },
  };
}
console.log(JSON.stringify([await scenario("new learner", 0), await scenario("40 lessons in", 40)], null, 1));
process.exit(0);
