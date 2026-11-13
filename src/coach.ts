// Your study record, as your AI reads it: the device sends it whole (public/js/ai/study-record.js), and these take it apart, so an AI asks for a summary,
// one lesson, one concept or some misses rather than one huge blob. Pure, so they're tested on their own (scripts/test-coach.mjs). What's in a record
// is shown as data: a pack someone shared can say anything, and get_coaching_guide tells the AI so.

import { LibraryError } from "./library";
import { OWN_LANGUAGE_CODE, OWN_LANGUAGE_LIMITS } from "../public/js/lang/index.js";

/** A language's code as the registry writes it (lang/index.js): nl, zh-Hant; or a learner's own (lang/index.js OWN_LANGUAGE_CODE: kw, und-x-sindarin, nl-x-gronings). */
const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{1,8}){0,2}$/;
const isLanguageCode = (code: string) => LANGUAGE_CODE.test(code) || (code.length <= OWN_LANGUAGE_LIMITS.code && OWN_LANGUAGE_CODE.test(code));

type Unit = { id: string; name?: string; nl?: string; en?: string; deck?: string; about?: string; level: number; recall?: Record<string, number>; seen: number; right: number; wrong: number; lapses?: number; met?: number; due?: boolean; slipping?: boolean; leech?: boolean; last?: string; placed?: string };
type Sentence = { nl?: string; literal?: string[]; en?: string; units?: string[]; words?: string[]; right: number; missed: number; games?: Record<string, number>; last?: string };
type Miss = { at?: string; game: string; skill?: string; item?: string; nl?: string; literal?: string[]; en?: string; said?: string; note?: string; units: string[] };
type Lesson = { n: number; id: string; title: string; status: string; pattern?: string; teaches: { unit: string; text: string; means?: string }[]; sentences: string[] };
export type StudyRecord = {
  version: number;
  language: string;
  languageName: string;
  from?: string;
  device?: string;
  evidenceAt: number;
  builtAt?: string;
  packs?: string[];
  place?: { lesson: number; of: number; written?: number; id: string | null; title: string | null; lessonsDone: number; chosenByThem?: boolean; today?: unknown };
  lessons?: Lesson[];
  games?: Record<string, { name: string; right: number; wrong: number }>;
  skills?: Record<string, { right: number; wrong: number }>;
  struggles?: { patterns?: { id: string; name: string; why: string }[]; words?: { id: string; name: string; why: string }[]; phrases?: { id: string; name: string; why: string }[]; cards?: { id: string; name: string; why: string }[] };
  patterns?: Unit[];
  phrases?: Unit[];
  words?: Unit[];
  cards?: Unit[];
  misses?: Miss[];
  sentences?: Record<string, Sentence>;
  totals?: Record<string, number>;
};

/** A record as a device may send one: only its shape; what's in it is the person's own, and it's data. */
export function checkRecord(value: Record<string, unknown>): StudyRecord {
  const list = (key: string) => value[key] === undefined || Array.isArray(value[key]);
  if (value.version !== 1) throw new LibraryError("This study record is from another version of the app.");
  if (typeof value.language !== "string" || !isLanguageCode(value.language)) throw new LibraryError("A study record names its language.");
  if (typeof value.evidenceAt !== "number" || !Number.isFinite(value.evidenceAt)) throw new LibraryError("A study record says when its latest answer was.");
  if (!["lessons", "patterns", "phrases", "words", "cards", "misses"].every(list)) throw new LibraryError("A study record's lists must be lists.");
  return value as unknown as StudyRecord;
}

const HOW_TO_READ =
  "level: 0 new to 4 strong. recall: how likely they are to recall it now, in %, by skill (read, hear, say). seen, right, wrong: answers. lapses: separate days they forgot it after knowing it. due: time to review. slipping: was strong, now due. leech: keeps coming back wrong. placed: when a placement test (Find your level) put it down as known without asking it; its seen, right and wrong count only answers since, never the placement. In a literal line, the word-for-word English follows the language's order, and *starred* words sit somewhere English wouldn't put them. nl always holds text in the language they're learning, whatever it is.";

const nameOfUnit = (record: StudyRecord, id: string) => {
  const list = id.startsWith("p:") ? record.patterns : id.startsWith("c:") ? record.phrases : id.startsWith("k:") ? record.cards : record.words;
  const found = list?.find((unit) => unit.id === id);
  return found?.name ?? found?.nl ?? id.slice(2);
};
const missView = (record: StudyRecord, miss: Miss) => ({ ...miss, units: undefined, about: miss.units.map((id) => nameOfUnit(record, id)) });
const accuracy = (counts?: Record<string, { name?: string; right: number; wrong: number }>) =>
  Object.fromEntries(Object.entries(counts ?? {}).map(([key, c]) => [c.name ?? key, { right: c.right, wrong: c.wrong, percentRight: c.right + c.wrong ? Math.round((c.right / (c.right + c.wrong)) * 100) : null }]));

/** Everything worth having at the start of a conversation, small enough to read at once. */
export function summaryOf(record: StudyRecord, updatedAt: number, others: { language: string; updatedAt: number }[]) {
  const studied = (record.patterns ?? []).filter((p) => p.seen || p.met);
  const notYet = (record.patterns ?? []).filter((p) => !p.seen && !p.met).map((p) => p.name ?? p.id);
  const current = record.lessons?.find((lesson) => lesson.status === "current");
  return {
    language: record.language,
    languageName: record.languageName,
    from: record.from,
    asOf: new Date(updatedAt).toISOString(),
    latestAnswer: record.evidenceAt ? new Date(record.evidenceAt).toISOString() : null,
    howToRead: HOW_TO_READ,
    where: record.place,
    currentLesson: current ? { n: current.n, title: current.title, teaches: current.teaches.map((t) => `${t.text}${t.means ? `: ${t.means}` : ""}`) } : null,
    totals: record.totals,
    byGame: accuracy(record.games),
    bySkill: accuracy(record.skills),
    strugglingMost: record.struggles ?? {},
    recentMisses: (record.misses ?? []).slice(0, 12).map((miss) => missView(record, miss)),
    grammar: studied,
    grammarNotMetYet: notYet,
    otherLanguages: others.map((other) => ({ language: other.language, asOf: new Date(other.updatedAt).toISOString() })),
    forMore: "study_lesson (one lesson), study_concept (one pattern, word, phrase or card of a deck: its explanation, their sentences with it, their misses), study_misses (the sentences they got wrong, by game or concept), study_sentence (one of their sentences, why each word is there). get_coaching_guide says how to use them.",
  };
}

const normal = (text: string) => text.toLowerCase().normalize("NFC").trim();

/** One lesson, by its number, its id or words of its title. */
export function lessonOf(record: StudyRecord, asked: string) {
  const lessons = record.lessons ?? [];
  const want = normal(asked).replace(/^lesson\s+/, "");
  const number = /^\d+$/.test(want) ? Number(want) : null;
  const lesson = lessons.find((l) => l.n === number) ?? lessons.find((l) => normal(l.id) === want) ?? lessons.find((l) => normal(l.title).includes(want));
  if (!lesson) {
    return { found: false, note: `No lesson like "${asked}" in what they've reached. They're on lesson ${record.place?.lesson ?? "?"} of ${record.place?.of ?? "?"}; the record holds the lessons up to a little past that.`, lessons: lessons.slice(-20).map((l) => ({ n: l.n, title: l.title, status: l.status })) };
  }
  const missed = (record.misses ?? []).filter((miss) => miss.item && lesson.sentences.includes(miss.item));
  return {
    found: true,
    n: lesson.n,
    id: lesson.id,
    title: lesson.title,
    status: lesson.status,
    pattern: lesson.pattern ? (record.patterns ?? []).find((p) => p.id === lesson.pattern) ?? null : null,
    teaches: lesson.teaches.map((thing) => {
      const list = thing.unit.startsWith("c:") ? record.phrases : record.words;
      const state = list?.find((unit) => unit.id === thing.unit);
      return { text: thing.text, means: thing.means, ...(state ? { level: state.level, recall: state.recall, seen: state.seen, right: state.right, wrong: state.wrong, due: state.due, leech: state.leech } : { notTestedYet: true }) };
    }),
    sentences: lesson.sentences.map((id) => record.sentences?.[id]).filter(Boolean),
    missedHere: missed.map((miss) => missView(record, miss)),
  };
}

/** The sentences a unit is in, what they missed first. */
function sentencesWith(record: StudyRecord, id: string, count: number) {
  const lemma = id.startsWith("w:") ? id.slice(2) : null;
  return Object.values(record.sentences ?? {})
    .filter((s) => (lemma ? s.words?.includes(lemma) : s.units?.includes(id)))
    .sort((a, b) => b.missed - a.missed || (b.last ?? "").localeCompare(a.last ?? ""))
    .slice(0, count)
    .map(({ units, words, ...sentence }) => sentence);
}

/** One pattern, word, phrase or card of a deck: by its id, or by what it's called. */
export function conceptOf(record: StudyRecord, asked: string) {
  const want = normal(asked);
  const every = [...(record.patterns ?? []), ...(record.phrases ?? []), ...(record.words ?? []), ...(record.cards ?? [])];
  const called = (unit: Unit) => [unit.id, unit.id.slice(2), unit.name, unit.nl].filter((name): name is string => typeof name === "string").map(normal);
  const unit = every.find((u) => called(u).includes(want)) ?? every.filter((u) => u.id.startsWith("p:") || u.id.startsWith("c:") || u.id.startsWith("k:")).find((u) => called(u).some((name) => name.includes(want) || (want.length > 3 && want.includes(name))));
  if (!unit) {
    // A form of a word ("gegaan") or a word that's only in a sentence: what they've seen it in, if anything.
    const inSentences = Object.values(record.sentences ?? {}).filter((s) => s.nl && normal(s.nl).split(/[^\p{L}\p{M}'-]+/u).includes(want)).slice(0, 8).map(({ units, words, ...sentence }) => sentence);
    return { found: false, note: inSentences.length ? `"${asked}" isn't something they've been tested on by that name, but it's in these sentences of theirs.` : `"${asked}" isn't in what they've studied, as far as this record goes. It may be among words they know well that were left out (totals.wordsLeftOut).`, sentences: inSentences };
  }
  const id = unit.id;
  const lemma = id.startsWith("w:") ? id.slice(2) : null;
  const inLesson = (record.lessons ?? []).filter((lesson) => lesson.pattern === id || lesson.teaches.some((t) => t.unit === id)).map((lesson) => ({ n: lesson.n, title: lesson.title, status: lesson.status }));
  return {
    found: true,
    kind: id.startsWith("p:") ? "pattern" : id.startsWith("c:") ? "phrase" : id.startsWith("k:") ? "card" : "word",
    ...unit,
    why: [...(record.struggles?.patterns ?? []), ...(record.struggles?.phrases ?? []), ...(record.struggles?.words ?? []), ...(record.struggles?.cards ?? [])].find((s) => s.id === id)?.why,
    inLessons: inLesson,
    sentences: sentencesWith(record, id, 12),
    misses: (record.misses ?? []).filter((miss) => miss.units.includes(id) || (lemma && miss.units.includes(`w:${lemma}`))).slice(0, 12).map((miss) => missView(record, miss)),
    howToRead: HOW_TO_READ,
  };
}

/** The sentences they got wrong, newest first, by game or concept. */
export function missesOf(record: StudyRecord, { game, concept, limit = 30 }: { game?: string; concept?: string; limit?: number }) {
  const wantGame = game ? normal(game) : null;
  const wantConcept = concept ? normal(concept) : null;
  const matched = (record.misses ?? []).filter((miss) => {
    if (wantGame && !normal(miss.game).includes(wantGame)) return false;
    if (wantConcept && !miss.units.some((id) => normal(id) === wantConcept || normal(id.slice(2)) === wantConcept || normal(nameOfUnit(record, id)).includes(wantConcept))) return false;
    return true;
  });
  return { count: matched.length, misses: matched.slice(0, Math.min(Math.max(limit, 1), 100)).map((miss) => missView(record, miss)), games: Object.values(record.games ?? {}).map((g) => g.name), ...(record.totals?.leftOutMisses ? { olderMissesNotKept: record.totals.leftOutMisses } : {}) };
}
