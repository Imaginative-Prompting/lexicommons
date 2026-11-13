// Your study as your AI can read it, so you can go to your own AI app and talk about what you're learning: where you are on the path, what each
// lesson taught, how strong each thing is, what you struggle with, and the sentences you missed, in which game. Built on this device from your evidence
// (study/progress.js, through the scheduler) and the path, for the language you're learning, and sent after you study, ONLY while an AI is connected:
// with none, nothing here leaves the device (the server refuses it too). It replaces the last one for that language, and goes when your last AI
// does (src/app.ts). The AI reads it in parts (src/coach.ts, src/mcp-coach.ts). Reading a record never counts as anything: it's a copy, and the evidence stays here.

import { languageName } from "../lang/index.js";
import { LIMITS } from "../practice/protocol.js";
import { aiConnected, onLayoutChange } from "../shell/layout.js";
import { CHUNKS, PACKS, PATTERNS, PATTERNS_IN_USE, WORDS, cardById, contentLanguage, describe, itemById, onContentChange, sentenceUnits, storedSentence } from "../study/content.js";
import { isSentence } from "../study/pack-items.js";
import { onDoneChange } from "../study/done.js";
import { learningFrom } from "../study/learning.js";
import { pathLessons } from "../study/path.js";
import { placeOn } from "../study/path-place.js";
import { allEvidence, gradeOf, langOf, onProgressChange, unitState } from "../study/progress.js";
import { WAYS } from "../study/settings.js";
import { sampleOn } from "../study/sample-mode.js";
import { fetchRetrying } from "../lx/retry.js";

const DAY = 24 * 3600_000;
const RECENT = 14 * DAY;
const KEEP = { misses: 150, sentences: 500, patterns: 12, words: 20, phrases: 8, cards: 20, lessonsAhead: 2, sentencesPerLesson: 12 };
const iso = (ms) => (ms ? new Date(ms).toISOString() : undefined);
const pct = (recall) => (recall == null ? undefined : Math.round(recall * 100));
const GAME_NAME = (activity) => WAYS[activity] ?? { "arrange-english": "Put it in English order", "type-heard": "Type what you hear", "listen-type": "Type what you hear", "listen-meaning": "What did you hear?", "listen-order": "Put what you hear in order", card: "Study cards", meet: "Meeting something new", "read-aloud": "Read aloud" }[activity] ?? activity;
/** Lets the page breathe every so often: this runs while someone's on the screen. */
const breathe = () => new Promise((resolve) => setTimeout(resolve));

function unitOf(id, lang, now, recentWrong) {
  const s = unitState(id, { lang, now });
  const strengths = Object.entries(s.strengths).filter(([, v]) => v);
  const recall = Object.fromEntries(strengths.map(([skill, v]) => [skill, pct(v.recall)]));
  const lapses = Math.max(0, ...strengths.map(([, v]) => v.lapses ?? 0));
  const lowest = strengths.length ? Math.min(...strengths.map(([, v]) => v.recall)) : null;
  const recent = recentWrong.get(id) ?? 0;
  const rate = s.reviews ? s.wrong / s.reviews : 0;
  const struggling = s.reviews > 0 && (s.wrong > 0 || s.leech || (lowest !== null && lowest < 0.5));
  const why = struggling
    ? [
        s.wrong ? `missed ${s.wrong} of ${s.reviews}` : `answered ${s.reviews} right, and fading`,
        recent ? `${recent} of those in the last two weeks` : "",
        lapses ? `forgotten on ${lapses} separate day${lapses === 1 ? "" : "s"}` : "",
        lowest !== null ? `about ${pct(lowest)}% likely to recall it now` : "",
        s.leech ? "it keeps coming back wrong, so more of the same won't fix it" : "",
      ].filter(Boolean).join("; ")
    : undefined;
  return {
    state: {
      level: s.level,
      ...(strengths.length ? { recall } : {}),
      seen: s.reviews,
      right: s.right,
      wrong: s.wrong,
      ...(lapses ? { lapses } : {}),
      ...(s.met ? { met: s.met } : {}),
      ...(s.due ? { due: true } : {}),
      ...(s.slipping ? { slipping: true } : {}),
      ...(s.leech ? { leech: true } : {}),
      ...(s.lastAt ? { last: iso(s.lastAt) } : {}),
      // Put down as known by a placement (Find your level), not by answers: when, so coaching never reads it as answers.
      ...(s.placedAt ? { placed: iso(s.placedAt) } : {}),
    },
    score: struggling ? recent * 2 + lapses * 2 + (s.leech ? 4 : 0) + (s.slipping ? 1.5 : 0) + (lowest === null ? 0 : (1 - lowest) * 2) + rate : 0,
    why,
    strongest: strengths.length ? Math.max(...strengths.map(([, v]) => v.stability ?? 0)) : 0,
  };
}

// What a row's item names: a sentence of Study's, or a plain item from a deck, which is its own unit.
const heldItem = (id) => itemById.get(id) ?? cardById(id);
const unitsOfItem = (id, item) => (isSentence(item) ? sentenceUnits(item) : [`k:${id}`]);
const wordsOfItem = (item) => [...new Set((item.words ?? []).filter(([, word]) => word).map(([, word]) => word))];
const sentenceOf = (item) => ({ nl: storedSentence(item), literal: item.literal?.map(([text, moved]) => (moved ? `*${text}*` : text)), en: item.means });

/** The record for the language you're learning. Yields as it goes: a heavy learner's has thousands of units to read. */
export async function buildStudyRecord({ now = Date.now(), device = "" } = {}) {
  const lang = contentLanguage();
  const rows = allEvidence().filter((row) => langOf(row) === lang);
  const recentWrong = new Map();
  const games = {};
  const skills = {};
  const practiced = new Map();
  const seen = new Set();
  let answers = 0;
  let right = 0;
  const answered = new Set();
  let evidenceAt = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i % 3000 === 2999) await breathe();
    const row = rows[i];
    seen.add(row.concept);
    evidenceAt = Math.max(evidenceAt, row.at);
    const grade = gradeOf(row);
    // A slip blaming no unit (session.js): a wrong answer all the same, on no unit.
    if (!grade && !row.slip) continue;
    const wrong = grade === "again" || row.slip === true;
    if (grade === "again" && now - row.at < RECENT) recentWrong.set(row.concept, (recentWrong.get(row.concept) ?? 0) + 1);
    // One answer writes a row per unit it tested: an answer is one moment on one sentence, wrong if any of it was.
    const key = `${row.at}|${row.item ?? row.concept}`;
    const game = row.activity ?? "other";
    if (!answered.has(key)) {
      answered.add(key);
      answers++;
      if (!wrong) right++;
      games[game] ??= { name: GAME_NAME(game), right: 0, wrong: 0 };
      games[game][wrong ? "wrong" : "right"]++;
      skills[row.skill] ??= { right: 0, wrong: 0 };
      skills[row.skill][wrong ? "wrong" : "right"]++;
    }
    if (row.item) {
      const info = practiced.get(row.item) ?? { missed: 0, right: 0, games: {}, lastAt: 0 };
      info.lastAt = Math.max(info.lastAt, row.at);
      if (!answered.has(`${key}|seen`)) {
        answered.add(`${key}|seen`);
        info[wrong ? "missed" : "right"]++;
        info.games[game] = (info.games[game] ?? 0) + 1;
      }
      practiced.set(row.item, info);
    }
  }

  // Every unit tested, and every pattern there is, so its explanation comes with it.
  const patternIds = new Set([...[...PATTERNS_IN_USE].map((id) => `p:${id}`), ...[...seen].filter((id) => id.startsWith("p:"))]);
  const patterns = [];
  const phrases = [];
  const words = [];
  const cards = [];
  const scored = { patterns: [], phrases: [], words: [], cards: [] };
  let n = 0;
  const units = [...patternIds, ...[...seen].filter((id) => !id.startsWith("p:"))];
  for (const id of units) {
    if (++n % 200 === 0) await breathe();
    const { state, score, why, strongest } = unitOf(id, lang, now, recentWrong);
    const kind = id[0];
    const info = describe(id);
    if (kind === "p") {
      if (PATTERNS[id.slice(2)]?.retired && !state.seen) continue;
      patterns.push({ id, name: info.name, about: info.about, ...state });
    } else if (kind === "c") phrases.push({ id, nl: CHUNKS[id.slice(2)]?.text ?? info.name, en: CHUNKS[id.slice(2)]?.en, ...state });
    else if (kind === "w" && (state.seen || state.met)) words.push({ id, en: WORDS[id.slice(2)], ...state, strength: strongest });
    else if (kind === "k" && (state.seen || state.met)) {
      // A card of a deck: only if the deck's still here, as nothing could be said about it otherwise.
      const card = cardById(id.slice(2));
      if (card) cards.push({ id, nl: card.text, en: card.means, deck: PACKS.find((pack) => pack.id === id.slice(2, id.indexOf("/")))?.name, ...state, strength: strongest });
    }
    if (why) scored[kind === "p" ? "patterns" : kind === "c" ? "phrases" : kind === "k" ? "cards" : "words"].push({ id, name: info.name, why, score });
  }
  const top = (list, count) => list.sort((a, b) => b.score - a.score).slice(0, count).map(({ id, name, why }) => ({ id, name, why }));
  const struggles = { patterns: top(scored.patterns, KEEP.patterns), words: top(scored.words, KEEP.words), phrases: top(scored.phrases, KEEP.phrases), cards: top(scored.cards, KEEP.cards) };

  // The path: where you are, what each lesson you've been through taught, and the next few.
  const lessons = pathLessons();
  const { lessonNow } = await import("../study/plan.js");
  const day = { lesson: lessonNow(now) };
  const here = day.lesson ? lessons.findIndex((lesson) => lesson.id === day.lesson.id) : lessons.length;
  await breathe();
  const shownLessons = lessons.slice(0, here + 1 + KEEP.lessonsAhead).map((lesson, i) => ({
    n: i + 1,
    id: lesson.id,
    title: lesson.title,
    status: i < here ? "done" : i === here ? "current" : "next",
    ...(lesson.concept ? { pattern: `p:${lesson.concept}` } : {}),
    teaches: lesson.things.map((thing) => ({ unit: thing.unit, text: thing.text, means: thing.means })),
    sentences: (lesson.items ?? []).slice(0, KEEP.sentencesPerLesson),
  }));

  // The sentences: what you missed first, then what you've had most recently, then the lessons' own.
  const order = [...practiced.entries()].sort((a, b) => Math.sign(b[1].missed) - Math.sign(a[1].missed) || b[1].lastAt - a[1].lastAt);
  const sentences = {};
  for (const [id, info] of order.slice(0, KEEP.sentences)) {
    const item = heldItem(id);
    if (!item) continue;
    sentences[id] = { ...sentenceOf(item), units: unitsOfItem(id, item), words: wordsOfItem(item), right: info.right, missed: info.missed, games: info.games, last: iso(info.lastAt) };
  }
  for (const lesson of shownLessons.slice(Math.max(0, here - 1))) {
    for (const id of lesson.sentences) {
      const item = itemById.get(id);
      if (item && !sentences[id]) sentences[id] = { ...sentenceOf(item), units: sentenceUnits(item), words: [...new Set(item.words.filter(([, word]) => word).map(([, word]) => word))], right: 0, missed: 0 };
    }
  }

  // The misses, newest first: one per answer, with what you put where the game knows it, and what it was about.
  await breathe();
  const misses = [];
  const byAnswer = new Map();
  for (let i = rows.length - 1; i >= 0 && byAnswer.size <= KEEP.misses; i--) {
    const row = rows[i];
    if (gradeOf(row) !== "again" && row.slip !== true) continue;
    const key = `${row.at}|${row.item ?? row.concept}`;
    let miss = byAnswer.get(key);
    if (!miss) {
      if (byAnswer.size === KEEP.misses) break;
      const item = row.item ? heldItem(row.item) : null;
      miss = { at: iso(row.at), game: GAME_NAME(row.activity ?? "other"), skill: row.skill, ...(row.item ? { item: row.item } : {}), ...(item ? sentenceOf(item) : {}), units: [] };
      byAnswer.set(key, miss);
      misses.push(miss);
    }
    if (!row.slip) miss.units.push(row.concept);
    if (row.said) miss.said = row.said;
    if (row.note) miss.note = row.note;
  }

  const record = {
    version: 1,
    language: lang,
    languageName: languageName(lang),
    from: learningFrom(),
    device,
    evidenceAt,
    builtAt: iso(now),
    packs: PACKS.filter((pack) => pack.language === lang).map((pack) => pack.name).slice(0, 40),
    place: { lesson: Math.min(here + 1, lessons.length), of: lessons.length, written: lessons.filter((lesson) => !lesson.worked).length, id: day.lesson?.id ?? null, title: day.lesson?.title ?? null, chosenByThem: Boolean(placeOn(lang)), lessonsDone: Math.max(0, here), today: { left: day.left, reviews: day.reviews, newThings: day.newThings, reviewDay: Boolean(day.reviewDay), comeback: Boolean(day.comeback) } },
    lessons: shownLessons,
    games,
    skills,
    struggles,
    patterns,
    phrases,
    words,
    cards,
    misses,
    sentences,
    totals: { cardsStudied: cards.length, answers, right, wrong: answers - right, unitsSeen: seen.size, days: new Set(rows.map((row) => Math.floor(row.at / DAY))).size, leftOutMisses: Math.max(0, answers - right - misses.length) },
  };
  await breathe();
  return fit(record);
}

/**
 * Under the limit, so the server never refuses it: a record it refused would leave your AI with an old one, and be tried again for ever without a word. Sentences past half
 * the limit go first, the ones you never missed and then the ones you did, oldest first (long ones, in a pack of your own, would otherwise take the place of everything else);
 * then the words and cards you know best; then more sentences the same way; then the oldest misses. What went is in totals, which your AI reads.
 */
function fit(record) {
  // In bytes, as the server counts them: a sentence with an é or a Japanese word is longer than its length.
  const encoder = new TextEncoder();
  const bytesOf = (value) => encoder.encode(JSON.stringify(value)).length;
  const size = () => bytesOf(record);
  const dropSentences = (over) => {
    const entries = Object.entries(record.sentences);
    const oldestFirst = (a, b) => (a[1].last ?? "").localeCompare(b[1].last ?? "");
    for (const [id, sentence] of [...entries.filter(([, s]) => !s.missed).sort(oldestFirst), ...entries.filter(([, s]) => s.missed).sort(oldestFirst)]) {
      if (over <= 0) break;
      // Measured once each: writing a whole record out again for every sentence would hold up the page.
      over -= bytesOf(id) + bytesOf(sentence) + 2;
      delete record.sentences[id];
      record.totals.sentencesLeftOut = (record.totals.sentencesLeftOut ?? 0) + 1;
    }
  };
  const isCard = (unit) => unit.id.startsWith("k:");
  const hold = (units) => {
    record.words = units.filter((unit) => !isCard(unit));
    record.cards = units.filter(isCard);
  };
  const all = [...record.words, ...record.cards].sort((a, b) => (b.wrong ? 1 : 0) - (a.wrong ? 1 : 0) || a.strength - b.strength);
  for (const unit of all) delete unit.strength;
  hold(all);
  if (size() > LIMITS.recordBytes) {
    dropSentences(bytesOf(record.sentences) - LIMITS.recordBytes / 2);
    hold([]);
    // Room for what's said about what's left out, in totals, too.
    let room = LIMITS.recordBytes - size() - 64;
    let kept = 0;
    for (const unit of all) {
      room -= bytesOf(unit) + 1;
      if (room < 0) break;
      kept++;
    }
    hold(all.slice(0, kept));
    const wordsLeftOut = all.filter((unit) => !isCard(unit)).length - record.words.length;
    const cardsLeftOut = all.filter(isCard).length - record.cards.length;
    if (wordsLeftOut) record.totals.wordsLeftOut = wordsLeftOut;
    if (cardsLeftOut) record.totals.cardsLeftOut = cardsLeftOut;
  }
  if (size() > LIMITS.recordBytes) dropSentences(size() - LIMITS.recordBytes + 16);
  while (size() > LIMITS.recordBytes && record.misses.length > 20) record.misses.length = Math.floor(record.misses.length * 0.8);
  return record;
}

// ---------- keeping it fresh ----------

const KEY = "lx.ai.record.v1";
const AFTER_CHANGE_MS = 20_000;
const AT_LEAST_EVERY_MS = 24 * 3600_000; // recall fades with time, even with nothing new
let kept = {};
try {
  kept = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
} catch {}
const keep = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {}
};
function deviceId() {
  kept.device ||= Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  keep();
  return kept.device;
}

let timer = null;
let running = false;
let again = false;
// The server's overload tried again (lx/retry.js): the record put whole (idempotent); taking it away only when the server says it wasn't applied.
const send = (method, body) =>
  fetchRetrying("/api/ai/record", { method, credentials: "same-origin", ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}) }, { idempotent: method === "PUT" });

async function sendNow() {
  clearTimeout(timer);
  // The sample learner isn't you: your AI's record stays as you left it (study/sample-mode.js).
  if (sampleOn()) return;
  if (running) return void (again = true);
  running = true;
  try {
    if (!aiConnected()) {
      // No AI any more: what went up goes (a connection can end without this device being there), and nothing else does.
      if (kept.sent) {
        const gone = await send("DELETE");
        if (gone.ok) {
          kept.sent = null;
          keep();
        }
      }
      return;
    }
    const lang = contentLanguage();
    const rows = allEvidence().filter((row) => langOf(row) === lang);
    const mark = `${rows.length}:${rows.at(-1)?.at ?? 0}:${placeOn(lang) ?? ""}`;
    const last = kept.sent?.[lang];
    if (last?.mark === mark && Date.now() - last.at < AT_LEAST_EVERY_MS) return;
    const record = await buildStudyRecord({ device: deviceId() });
    if (!aiConnected()) return;
    const response = await send("PUT", JSON.stringify(record));
    if (response.ok) {
      kept.sent = { ...(kept.sent ?? {}), [lang]: { mark, at: Date.now() } };
      keep();
    }
  } catch {
    // It goes again after the next thing studied, or the next open.
  } finally {
    running = false;
    if (again) {
      again = false;
      timer = setTimeout(sendNow, AFTER_CHANGE_MS);
    }
  }
}

const soon = (ms = AFTER_CHANGE_MS) => {
  if (!aiConnected() && !kept.sent) return;
  clearTimeout(timer);
  timer = setTimeout(sendNow, ms);
};

let started = false;
/** Keeps your AI's copy fresh while one is connected. From the shell, once the packs are in. */
export function startStudyRecord() {
  if (started) return;
  started = true;
  onProgressChange(() => soon());
  onContentChange(() => soon());
  onLayoutChange(() => soon(1000));
  // A finished session: right away, so you can go straight to your AI and talk about it.
  onDoneChange(() => soon(500));
  soon(3000);
}

/** For a check: send it now, and resolve when that's done. */
export const flushStudyRecord = () => sendNow();
