// Practice with your AI: what a live practice is made of, and the checks every turn goes through. Pure (no DOM, no
// storage), so the Worker (src/practice.ts) runs the same checks as the app and Node tests them
// (scripts/test-practice.mjs), as look-rules.js does for looks.
//
// A practice is a list of turns, each { seq, at, who, type, ... }:
//   who "ai"   reply    { say: [line], explain, translate, scene, card, grades: [grade], expect }
//              summary  { text, wentWell, workOn, newWords, concepts }
//   who "you"  said     { text, how: typed | spoken, engine, unsure: [word] }
//              card     { card: <the reply's seq>, game, correct, answer, hint, tries }
//              hint     {}
//   who "app"  joined · ended · note (what happened, for the transcript)
// line  = { nl, literal: [{ text, moved }], en, english: [chunk index in English order], words: { surface: lemma } }
// grade = { turn: <your turn's seq>, verdict: right | fixed | wrong | none, better, marks: [{ said, fix }],
//           concepts: [{ concept, outcome: right | wrong | hint | avoided, note, skill }], note }
// card  = { game, prompt, item } with item in the starter deck's shape (study/content.js), so the app's own games play it.
// A practice is in one language (settings.language, the one being learned when it started): its lines, its grades and
// the evidence they become are all in it.

import { LANGUAGES, sentenceEnds } from "../lang/index.js";

export const KINDS = {
  conversation: {
    name: "Conversation",
    icon: "chat",
    about: "Talk about anything at your level. Your AI steers towards what you're learning and corrects as you go.",
  },
  roleplay: {
    name: "Role-play",
    icon: "user",
    about: "A scene with a goal: dinner with family, the bakery, the station. Your AI plays the other person.",
  },
  translate: {
    name: "Translate",
    icon: "globe",
    about: "English sentences aimed at your weak patterns. Say or type them in the language you're learning.",
  },
  story: {
    name: "Story",
    icon: "book",
    about: "A short story, a few lines at a time, read aloud. Answer questions or say what happens next.",
  },
  games: {
    name: "Deal me games",
    icon: "cards",
    about: "Fresh sentences for your weak spots, played in the app's own games. Each one aims at your last mistake.",
  },
  why: {
    name: "Ask why",
    icon: "info",
    about: "Ask about the grammar of the language you're learning. Answers come with examples on the literal line.",
  },
};

export const ANSWERS = { both: "Speak or type", speak: "Speak", type: "Type" };
export const MINUTES = [5, 10, 15, 20, 30];
export const GAMES = ["choose", "arrange", "place", "fill", "type", "write", "match", "say"];
export const VERDICTS = ["right", "fixed", "wrong", "none"];
export const OUTCOMES = ["right", "wrong", "hint", "avoided"];
export const SKILLS = ["reading", "writing", "speaking", "listening"];
export const EXPECT = ["speak", "type", "either", "card", "none"];

export const LIMITS = {
  line: 400, // characters in one line in the language, an English line or a sentence of yours
  lines: 6, // lines in the language in one reply
  explain: 1200,
  note: 300,
  said: 600,
  grades: 4,
  concepts: 12,
  marks: 12,
  wrong: 3,
  options: 5,
  pairs: 6,
  sentenceWords: 16,
  summary: 2000,
  list: 8,
  newWords: 20,
  topic: 80,
  turns: 400, // turns in one practice
  logTurns: 60, // turns in one practice_log call
  snapshotBytes: 64_000,
  recordBytes: 400_000, // your study record (ai/study-record.js)
};

/** A message for whoever sent the turn (the AI, through the tool's answer; the app, in its notice). */
export class PracticeError extends Error {
  constructor(message) {
    super(message);
    this.name = "PracticeError";
  }
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// A field read as text or a number, as String() and Number() read every primitive, but never from an object: JSON can
// carry one whose toString is null, which they throw on. An object reads as "" or NaN, which every check here refuses.
const asText = (value) => (value !== null && typeof value === "object" ? "" : String(value));
const asNumber = (value) => (value !== null && typeof value === "object" ? NaN : Number(value));

/** Text: trimmed, runs of space as one, no control characters; at most `max` characters. */
export function text(value, max, what, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new PracticeError(`${what} is missing.`);
    return undefined;
  }
  if (typeof value !== "string") throw new PracticeError(`${what} must be text.`);
  const out = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!out) {
    if (required) throw new PracticeError(`${what} is empty.`);
    return undefined;
  }
  if (out.length > max) throw new PracticeError(`${what} is ${out.length} characters; keep it to ${max}.`);
  return out;
}

const list = (value, what, max) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new PracticeError(`${what} must be a list.`);
  if (value.length > max) throw new PracticeError(`${what} has ${value.length} entries; keep it to ${max}.`);
  return value;
};

// A word without the punctuation around it.
const trimWord = (word) =>
  asText(word)
    .replace(/[’‘]/g, "'")
    .replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, "");

/** A word as it's compared: lower case, without the punctuation around it. */
export const bare = (word) => trimWord(word).toLowerCase();

/**
 * A dictionary form as the knowledge model keys it: lower case, unless the language capitalizes some (lemmaCase "any":
 * German nouns, w:Buch), as its packs do.
 */
export const lemmaCased = (lemma, language = "nl") => (LANGUAGES[language]?.lemmaCase === "any" ? lemma : lemma.toLowerCase());

const CONCEPT = /^(p|w|c):[\p{L}\p{N}][\p{L}\p{M}\p{N}\u200C\u200D' -]{0,47}$/u;
// A pack's own pattern, "<pack id>.<id>" (pack-format.js).
const OWN_PATTERN = /^p:[a-z0-9][a-z0-9-]{1,47}\.[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * A concept id: p:<pattern> (a grammar pattern), w:<lemma> (a word, cased as the language's lemmas are) or c:<phrase>
 * (a fixed phrase), as the knowledge model uses them, in the practice's language.
 */
export function conceptId(value, what = "concept", language = "nl") {
  const id = asText(value ?? "").trim();
  const kind = id.slice(0, 2);
  const rest = kind === "w:" ? lemmaCased(id.slice(2), language) : kind === "c:" ? id.slice(2).toLowerCase() : id.slice(2);
  const out = `${kind}${rest}`;
  if (!CONCEPT.test(out) && !OWN_PATTERN.test(out)) throw new PracticeError(`${what} "${id.slice(0, 60)}" isn't a concept id: use p:<pattern id>, w:<lemma> or c:<phrase>, as get_learner lists them.`);
  return out;
}

// The characters a language's sentences end with, as a regex class: . ! ? … and the language's own (lang/index.js).
const endMarks = (language) => [...new Set(sentenceEnds(language).join(""))].map((c) => c.replace(/[\\\]^-]/g, "\\$&")).join("");

/** "Ik heb gisteren een boek gelezen." → { words: ["Ik", …, "gelezen"], punct: "." }. language: whose own endings count too. */
export function splitSentence(nl, language) {
  const trimmed = nl.trim();
  const end = trimmed.match(new RegExp(`[${endMarks(language)}]+["”’»]?$`, "u"));
  const punct = end ? end[0] : "";
  const body = punct ? trimmed.slice(0, -punct.length).trim() : trimmed;
  return { words: body.split(/\s+/).filter(Boolean), punct };
}

/**
 * The literal line: English words in the order of the language being learned. Either ["I have", "*yesterday*",
 * "a book", "*read*"] (moved chunks between asterisks) or [{ text, moved }].
 */
export function literalChunks(value, what = "literal") {
  const chunks = list(value, what, 24).map((chunk, i) => {
    if (isObject(chunk)) return { text: text(chunk.text, 60, `${what}[${i}]`, { required: true }), moved: Boolean(chunk.moved) };
    const raw = text(chunk, 62, `${what}[${i}]`, { required: true });
    // Any starred stretch makes the chunk a moved one, punctuation outside the stars or not ("*do*?", "to *eat*").
    const moved = /\*[^*]+\*/.test(raw);
    return { text: moved ? raw.replace(/\*/g, "").replace(/\s+/g, " ").trim() : raw, moved };
  });
  return chunks.length ? chunks : undefined;
}

/** English order for a literal line: every chunk index exactly once. Anything else is dropped (the line can't flip). */
function englishOrder(value, chunks) {
  if (!Array.isArray(value) || !chunks || value.length !== chunks.length) return undefined;
  const seen = new Set(value);
  return seen.size === chunks.length && value.every((i) => Number.isInteger(i) && i >= 0 && i < chunks.length) ? value.slice() : undefined;
}

/** { surface: lemma } for the content words, so each word counts as evidence for its own concept. */
function wordMap(value, what, language) {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) throw new PracticeError(`${what} must be { "word as written": "lemma" }.`);
  const out = {};
  for (const [surface, lemma] of Object.entries(value).slice(0, 30)) {
    const key = bare(surface);
    const id = lemmaCased(trimWord(lemma), language);
    if (key && id && CONCEPT.test(`w:${id}`)) out[key] = id;
  }
  return Object.keys(out).length ? out : undefined;
}

/** One line of a reply, in the language being learned (language: its code; Dutch unless said, as every check here). */
export function checkLine(value, what = "say", language = "nl") {
  if (typeof value === "string") value = { nl: value };
  if (!isObject(value)) throw new PracticeError(`${what} must be { nl, literal?, en? }.`);
  const literal = literalChunks(value.literal, `${what}.literal`);
  return {
    nl: text(value.nl, LIMITS.line, `${what}.nl`, { required: true }),
    literal,
    english: englishOrder(value.english, literal),
    en: text(value.en, LIMITS.line, `${what}.en`),
    words: wordMap(value.words, `${what}.words`, language),
  };
}

function checkConceptGrades(value, what, language) {
  return list(value, what, LIMITS.concepts).map((entry, i) => {
    if (!isObject(entry)) throw new PracticeError(`${what}[${i}] must be { concept, outcome }.`);
    const outcome = asText(entry.outcome ?? "");
    if (!OUTCOMES.includes(outcome)) throw new PracticeError(`${what}[${i}].outcome must be one of ${OUTCOMES.join(", ")}.`);
    const skill = entry.skill === undefined ? undefined : asText(entry.skill);
    if (skill !== undefined && !SKILLS.includes(skill)) throw new PracticeError(`${what}[${i}].skill must be one of ${SKILLS.join(", ")}.`);
    return { concept: conceptId(entry.concept, `${what}[${i}].concept`, language), outcome, note: text(entry.note, LIMITS.note, `${what}[${i}].note`), skill };
  });
}

/** How your AI marked one of your turns. turn: the seq of the turn it grades (checked against the practice later). */
export function checkGrade(value, what = "grade", language = "nl") {
  if (!isObject(value)) throw new PracticeError(`${what} must be { turn, verdict, … }.`);
  const verdict = asText(value.verdict ?? "");
  if (!VERDICTS.includes(verdict)) throw new PracticeError(`${what}.verdict must be one of ${VERDICTS.join(", ")}.`);
  const turn = value.turn === undefined ? undefined : asNumber(value.turn);
  if (turn !== undefined && !Number.isInteger(turn)) throw new PracticeError(`${what}.turn must be the seq of the turn you're grading.`);
  const marks = list(value.marks, `${what}.marks`, LIMITS.marks).map((mark, i) => {
    if (!isObject(mark)) throw new PracticeError(`${what}.marks[${i}] must be { said, fix? }.`);
    return { said: text(mark.said, 80, `${what}.marks[${i}].said`, { required: true }), fix: text(mark.fix, 80, `${what}.marks[${i}].fix`) };
  });
  return {
    turn,
    verdict,
    better: text(value.better, LIMITS.line, `${what}.better`),
    marks,
    concepts: checkConceptGrades(value.concepts, `${what}.concepts`, language),
    note: text(value.note, LIMITS.note, `${what}.note`),
  };
}

function checkScene(value) {
  if (!isObject(value)) throw new PracticeError("scene must be { title, goal?, you?, them? }.");
  return {
    title: text(value.title, 80, "scene.title", { required: true }),
    goal: text(value.goal, 200, "scene.goal"),
    you: text(value.you, 120, "scene.you"),
    them: text(value.them, 120, "scene.them"),
  };
}

// The shared grammar's ids, and a pack's own ("<pack id>.<id>": pack-format.js).
const PATTERN_ID = /^(?:[a-z0-9][a-z0-9-]{1,47}\.)?[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * A game for the app to play, from your AI's sentence. Returns { game, prompt, item }, item shaped like the starter
 * deck's (study/content.js): { id, words: [[text, lemma?]], punct, literal: [[text, moved]], english, moved, means,
 * wrong, gap: { index, options }, concepts, pairs, place, from }.
 */
export function checkCard(value, id, language = "nl") {
  if (!isObject(value)) throw new PracticeError("card must be { game, … }.");
  const game = asText(value.game ?? "");
  if (!GAMES.includes(game)) throw new PracticeError(`card.game must be one of ${GAMES.join(", ")}.`);
  const prompt = text(value.prompt, 120, "card.prompt");
  const patterns = list(value.patterns, "card.patterns", 4).map((p) => asText(p).replace(/^p:/, ""));
  for (const p of patterns) if (!PATTERN_ID.test(p)) throw new PracticeError(`card.patterns: "${p.slice(0, 40)}" isn't a pattern id (lowercase, dashes).`);

  if (game === "match") {
    const pairs = list(value.pairs, "card.pairs", LIMITS.pairs).map((pair, i) => {
      if (!Array.isArray(pair) || pair.length !== 2) throw new PracticeError(`card.pairs[${i}] must be ["a word in the language", "English"].`);
      return [text(pair[0], 60, `card.pairs[${i}][0]`, { required: true }), text(pair[1], 60, `card.pairs[${i}][1]`, { required: true })];
    });
    if (pairs.length < 3) throw new PracticeError("A match card needs 3 to 6 pairs.");
    if (new Set(pairs.map(([nl]) => nl)).size !== pairs.length || new Set(pairs.map(([, en]) => en)).size !== pairs.length) {
      throw new PracticeError("card.pairs: every side in the language and every English side must be different.");
    }
    const words = wordMap(value.words, "card.words", language);
    return { game, prompt, item: { id, concepts: patterns, pairs, words: pairs.map(([nl]) => words?.[bare(nl)] ?? lemmaCased(trimWord(nl), language)) } };
  }

  const nl = text(value.nl, LIMITS.line, "card.nl", { required: true });
  const { words, punct } = splitSentence(nl, language);
  if (words.length < 2 || words.length > LIMITS.sentenceWords) throw new PracticeError(`card.nl has ${words.length} words; a card's sentence has 2 to ${LIMITS.sentenceWords}.`);
  const lemmas = wordMap(value.words, "card.words", language) ?? {};
  const literal = literalChunks(value.literal, "card.literal");
  const natural = text(value.en, LIMITS.line, "card.en");
  if (!natural && game !== "say") throw new PracticeError(`A ${game} card needs en: the sentence in natural English (it's the prompt).`);
  const item = {
    id,
    concepts: patterns,
    words: words.map((word) => (lemmas[bare(word)] ? [word, lemmas[bare(word)]] : [word])),
    punct,
    literal: literal ? literal.map((chunk) => [chunk.text, chunk.moved]) : [],
    english: englishOrder(value.english, literal) ?? null,
    moved: list(value.moved, "card.moved", 8).map((word) => text(word, 40, "card.moved", { required: true })),
    means: natural,
  };
  const indexOf = (word, what) => {
    const at = words.findIndex((w) => bare(w) === bare(word));
    if (at < 0) throw new PracticeError(`${what}: "${asText(word).slice(0, 40)}" isn't one of the sentence's words.`);
    return at;
  };

  if (game === "choose") {
    const wrong = list(value.wrong, "card.wrong", LIMITS.wrong).map((s, i) => text(s, LIMITS.line, `card.wrong[${i}]`, { required: true }));
    if (!wrong.length) throw new PracticeError("A choose card needs wrong: 1 to 3 plausible wrong versions of the sentence.");
    if (wrong.some((s) => s === nl) || new Set(wrong).size !== wrong.length) throw new PracticeError("card.wrong: each wrong version must differ from the sentence and from each other.");
    item.wrong = wrong;
  } else if (game === "fill" || game === "type") {
    if (!isObject(value.gap)) throw new PracticeError(`A ${game} card needs gap: { word${game === "fill" ? ", options" : ""} }.`);
    const index = indexOf(value.gap.word, "card.gap.word");
    const options = list(value.gap.options, "card.gap.options", LIMITS.options).map((o, i) => text(o, 40, `card.gap.options[${i}]`, { required: true }));
    if (game === "fill") {
      if (options.length < 2) throw new PracticeError("A fill card needs gap.options: 2 to 5 words, the right one among them.");
      if (!options.includes(words[index])) throw new PracticeError(`card.gap.options must include the word as written in the sentence ("${words[index]}").`);
      if (new Set(options).size !== options.length) throw new PracticeError("card.gap.options must all be different.");
    }
    item.gap = { index, options: game === "fill" ? options : [words[index]] };
  } else if (game === "place") {
    if (!isObject(value.place)) throw new PracticeError("A place card needs place: { word }, the word to take out and put back.");
    item.place = { index: indexOf(value.place.word, "card.place.word") };
  } else if (game === "say") {
    item.from = value.from === "english" ? "english" : "dutch";
    if (item.from === "english" && !natural) throw new PracticeError("A say card from English needs en.");
  }
  return { game, prompt, item };
}

/** One reply from your AI, in the practice's language. At least one of say, explain, translate, scene, card or grades. */
export function checkReply(value, { cardId = "card", language = "nl" } = {}) {
  if (!isObject(value)) throw new PracticeError("The reply must be an object.");
  const sayList = value.say === undefined ? [] : Array.isArray(value.say) ? value.say : [value.say];
  if (sayList.length > LIMITS.lines) throw new PracticeError(`say has ${sayList.length} lines; keep it to ${LIMITS.lines}.`);
  const gradeList = value.grades ?? (value.grade === undefined ? [] : [value.grade]);
  const reply = {
    say: sayList.map((line, i) => checkLine(line, sayList.length > 1 ? `say[${i}]` : "say", language)),
    explain: text(value.explain, LIMITS.explain, "explain"),
    translate: text(value.translate, LIMITS.line, "translate"),
    scene: value.scene === undefined || value.scene === null ? undefined : checkScene(value.scene),
    card: value.card === undefined || value.card === null ? undefined : checkCard(value.card, cardId, language),
    grades: list(gradeList, "grades", LIMITS.grades).map((grade, i) => checkGrade(grade, gradeList.length > 1 ? `grades[${i}]` : "grade", language)),
  };
  if (!reply.say.length && !reply.explain && !reply.translate && !reply.scene && !reply.card && !reply.grades.length) {
    throw new PracticeError("The reply is empty: send at least one of say, explain, translate, scene, card or grade.");
  }
  const expect = value.expect === undefined ? (reply.card ? "card" : "either") : asText(value.expect);
  if (!EXPECT.includes(expect)) throw new PracticeError(`expect must be one of ${EXPECT.join(", ")}.`);
  if (expect === "card" && !reply.card) throw new PracticeError('expect "card" needs a card.');
  reply.expect = expect;
  return reply;
}

/**
 * Points each grade at the turn of yours it marks (the newest ungraded one when it doesn't say), and drops marks whose
 * words aren't in what you said, so the app never underlines something you didn't write. turns: the practice so far;
 * grades: a checked reply's, changed in place. Returns a note for each mark left out. The room (src/practice.ts) and the
 * in-app AI (ai/inapp.js) both place grades with it.
 */
export function placeGrades(turns, grades) {
  const notes = [];
  if (!grades.length) return notes;
  const said = turns.filter((t) => t.who === "you" && t.type === "said");
  const graded = new Set(turns.filter((t) => t.who === "ai" && Array.isArray(t.grades)).flatMap((t) => t.grades.map((g) => g.turn)));
  for (const grade of grades) {
    if (grade.turn === undefined) {
      const target = [...said].reverse().find((t) => !graded.has(t.seq));
      if (!target) throw new PracticeError("There's no turn of theirs left to grade. Leave grade out, or give grade.turn.");
      grade.turn = target.seq;
    }
    const target = said.find((t) => t.seq === grade.turn);
    if (!target) throw new PracticeError(`grade.turn ${grade.turn} isn't one of their spoken or typed turns (those are: ${said.map((t) => t.seq).join(", ") || "none yet"}).`);
    graded.add(target.seq);
    const words = String(target.text).toLowerCase();
    grade.marks = grade.marks.filter((mark) => {
      const found = words.includes(mark.said.toLowerCase());
      if (!found) notes.push(`mark "${mark.said}": not in what they said (turn ${target.seq}), so it was left out.`);
      return found;
    });
  }
  return notes;
}

/**
 * The learner summary (practice/learner.js learnerSnapshot) under `max` bytes: the words most worth steering to first
 * (due, slipping or a leech; then the weakest; then the most recently tested), then the patterns' and phrases' long
 * "about" lines, then the patterns, phrases and words never practiced. The room's copy (learner.js, LIMITS.snapshotBytes) and
 * the in-app AI's (ai/inapp.js, a smaller one) are both trimmed by it.
 */
export function fitLearner(snapshot, max) {
  if (!isObject(snapshot)) return null;
  const size = (value) => JSON.stringify(value).length;
  let out = { ...snapshot, totals: { ...(snapshot.totals ?? {}) } };
  if (size(out) <= max) return out;
  const words = Array.isArray(out.words) ? out.words : [];
  const urgent = (w) => (w.due || w.slipping || w.leech ? 0 : 1);
  const order = [...words].sort((a, b) => urgent(a) - urgent(b) || (a.level ?? 0) - (b.level ?? 0) || String(b.last ?? "").localeCompare(String(a.last ?? "")));
  let room = max - size({ ...out, words: [], totals: { ...out.totals, wordsLeftOut: words.length } });
  const kept = [];
  for (const word of order) {
    const bytes = size(word) + 1;
    if (bytes > room) break;
    room -= bytes;
    kept.push(word);
  }
  out = { ...out, words: kept, totals: { ...out.totals, wordsLeftOut: words.length - kept.length } };
  if (size(out) <= max) return out;
  // Still too big with no words at all: the long lines go, then what was never practiced.
  const untested = (unit) => !unit.seen && !unit.due;
  const steps = [
    (o) => ({ ...o, patterns: (o.patterns ?? []).map(({ about, ...rest }) => rest) }),
    (o) => ({ ...o, examples: (o.examples ?? []).slice(0, 2) }),
    (o) => ({ ...o, phrases: (o.phrases ?? []).filter((p) => !untested(p)) }),
    (o) => ({ ...o, patterns: (o.patterns ?? []).filter((p) => !untested(p)) }),
    (o) => ({ ...o, recentMisses: (o.recentMisses ?? []).slice(0, 5) }),
  ];
  for (const step of steps) {
    out = step(out);
    if (size(out) <= max) return out;
  }
  return { ...out, words: [], phrases: [], patterns: [], recentMisses: [], examples: [] };
}

/** Your AI's summary at the end (practice_end), in the practice's language. */
export function checkSummary(value, { language = "nl" } = {}) {
  if (!isObject(value)) throw new PracticeError("summary must be { text, went_well?, work_on?, new_words? }.");
  const strings = (v, what) => list(v, what, LIMITS.list).map((s, i) => text(s, LIMITS.note, `${what}[${i}]`, { required: true }));
  return {
    text: text(value.text, LIMITS.summary, "summary.text", { required: true }),
    wentWell: strings(value.went_well ?? value.wentWell, "summary.went_well"),
    workOn: strings(value.work_on ?? value.workOn, "summary.work_on"),
    newWords: list(value.new_words ?? value.newWords, "summary.new_words", LIMITS.newWords).map((word, i) => {
      if (!isObject(word)) throw new PracticeError(`summary.new_words[${i}] must be { nl, en }.`);
      return { nl: text(word.nl, 60, `summary.new_words[${i}].nl`, { required: true }), en: text(word.en, 80, `summary.new_words[${i}].en`) };
    }),
    concepts: checkConceptGrades(value.concepts, "summary.concepts", language),
  };
}

/** A practice's settings, as the app starts it. */
export function checkSettings(value) {
  if (!isObject(value)) throw new PracticeError("Send { kind, answer, topic?, minutes?, language?, from? }.");
  const kind = asText(value.kind ?? "");
  if (!KINDS[kind]) throw new PracticeError(`kind must be one of ${Object.keys(KINDS).join(", ")}.`);
  const answer = asText(value.answer ?? "both");
  if (!ANSWERS[answer]) throw new PracticeError(`answer must be one of ${Object.keys(ANSWERS).join(", ")}.`);
  const minutes = asNumber(value.minutes ?? 10);
  if (!MINUTES.includes(minutes)) throw new PracticeError(`minutes must be one of ${MINUTES.join(", ")}.`);
  // The language it's in: the one being learned when it started (Dutch for a practice from before practices had one).
  const language = asText(value.language ?? "nl");
  if (!Object.hasOwn(LANGUAGES, language)) throw new PracticeError(`language must be one of ${Object.keys(LANGUAGES).join(", ")}.`);
  // Their own language, the one they learn from: what the AI explains in and writes the summary in (English for one from before).
  const from = asText(value.from ?? "en");
  if (!Object.hasOwn(LANGUAGES, from)) throw new PracticeError(`from must be one of ${Object.keys(LANGUAGES).join(", ")}.`);
  return { kind, answer, minutes, topic: text(value.topic, LIMITS.topic, "topic"), language, from };
}

/** One turn of yours, from the app. */
export function checkLearnerTurn(value) {
  if (!isObject(value)) throw new PracticeError("A turn must be an object.");
  const key = text(value.key, 64, "key");
  if (value.type === "said") {
    const how = value.how === "spoken" ? "spoken" : "typed";
    return {
      type: "said",
      key,
      text: text(value.text, LIMITS.said, "What you said", { required: true }),
      how,
      engine: how === "spoken" && (value.engine === "whisper" || value.engine === "browser") ? value.engine : undefined,
      unsure: how === "spoken" ? list(value.unsure, "unsure", 20).map((w) => text(w, 40, "unsure")).filter(Boolean) : [],
    };
  }
  if (value.type === "card") {
    const card = asNumber(value.card);
    if (!Number.isInteger(card)) throw new PracticeError("card must be the seq of the reply that dealt it.");
    const game = asText(value.game ?? "");
    if (!GAMES.includes(game)) throw new PracticeError("Unknown game.");
    const tries = value.tries === undefined ? undefined : Math.max(1, Math.min(9, Math.round(asNumber(value.tries)) || 1));
    return { type: "card", key, card, game, correct: Boolean(value.correct), answer: text(value.answer, LIMITS.said, "answer"), hint: Boolean(value.hint), tries };
  }
  if (value.type === "hint") return { type: "hint", key };
  throw new PracticeError("A turn's type must be said, card or hint.");
}

/**
 * practice_log: a conversation your AI had with you in its own app, logged as it goes or after the last message. Each
 * turn is { who: "you", text, how?, grade? } or { who: "ai", nl, literal?, en?, explain? }. Returns the turns in order,
 * a grade becoming a reply right after the turn it marks. language: the practice's.
 */
export function checkLogTurns(value, { language = "nl" } = {}) {
  const turns = list(value, "turns", LIMITS.logTurns);
  if (!turns.length) throw new PracticeError("turns is empty.");
  const out = [];
  turns.forEach((turn, i) => {
    if (!isObject(turn)) throw new PracticeError(`turns[${i}] must be an object.`);
    if (turn.who === "you") {
      out.push({ who: "you", type: "said", text: text(turn.text, LIMITS.said, `turns[${i}].text`, { required: true }), how: turn.how === "typed" ? "typed" : "spoken", unsure: [] });
      if (turn.grade !== undefined) out.push({ who: "ai", type: "reply", say: [], grades: [{ ...checkGrade(turn.grade, `turns[${i}].grade`, language), turn: undefined }], gradesPrevious: true, expect: "none" });
    } else if (turn.who === "ai") {
      const say = turn.nl ? [checkLine({ nl: turn.nl, literal: turn.literal, en: turn.en, english: turn.english, words: turn.words }, `turns[${i}]`, language)] : [];
      const explain = text(turn.explain, LIMITS.explain, `turns[${i}].explain`);
      if (!say.length && !explain) throw new PracticeError(`turns[${i}] needs nl (what you said, in the language they're learning) or explain.`);
      out.push({ who: "ai", type: "reply", say, explain, grades: [], expect: "none" });
    } else throw new PracticeError(`turns[${i}].who must be "you" (the learner) or "ai".`);
  });
  return out;
}

/** The sentence of a card's item, as text: its words joined as its language joins them (nothing in Japanese or Chinese). */
export const itemSentence = (item, language) => item.words.map(([word]) => word).join(LANGUAGES[language]?.separator ?? " ") + (item.punct ?? "");

/** A concept id for the person to read: "p:perfect" → its name if the catalog has one; "w:lezen" → "lezen". */
export function conceptLabel(id, patterns = {}) {
  const [kind, rest] = [id.slice(0, 1), id.slice(2)];
  if (kind === "p") return patterns[rest]?.name ?? rest.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  if (kind === "c") return rest.replace(/-/g, " ");
  return rest;
}
