// What you know, as your AI reads it (get_learner, and on joining a practice). Built on this device from your
// evidence (study/progress.js, through the scheduler) and sent when you open Practice or start a practice: every
// pattern, phrase and word you've been tested on (and the ones in your packs), with its level, how likely you are to
// recall it now by each strength, what's due, slipping or a leech, and your recent misses. It's about the language
// you're learning (study/learning.js): that language's packs and evidence only. Only this summary goes up; the
// evidence stays here. It's kept under the practice room's size limit, dropping the strongest words first.

import { api } from "../shell/api.js";
import { languageName } from "../lang/index.js";
import { CHUNKS, ITEMS, PATTERNS, WORDS, contentLanguage, itemById, storedSentence } from "../study/content.js";
import { learningFrom } from "../study/learning.js";
import { allEvidence, langOf, unitState } from "../study/progress.js";
import { LIMITS, conceptLabel, fitLearner } from "./protocol.js";
import { sampleOn } from "../study/sample-mode.js";

const iso = (ms) => (ms ? new Date(ms).toISOString() : undefined);
const pct = (recall) => (recall == null ? undefined : Math.round(recall * 100));

function state(id, lang, now) {
  const s = unitState(id, { lang, now });
  const recall = Object.fromEntries(Object.entries(s.strengths).filter(([, v]) => v).map(([skill, v]) => [skill, pct(v.recall)]));
  return {
    level: s.level,
    ...(Object.keys(recall).length ? { recall } : {}),
    seen: s.reviews,
    right: s.right,
    wrong: s.wrong,
    due: s.due || undefined,
    slipping: s.slipping || undefined,
    leech: s.leech || undefined,
    last: iso(s.lastAt),
  };
}

export function learnerSnapshot(now = Date.now()) {
  const lang = contentLanguage();
  const evidence = allEvidence().filter((row) => langOf(row) === lang);
  const seenIds = new Set(evidence.map((row) => row.concept));
  const tested = (id) => unitState(id, { lang, now }).reviews > 0;
  const ids = (prefix, deck) => [...new Set([...Object.keys(deck).map((id) => `${prefix}:${id}`), ...[...seenIds].filter((id) => id.startsWith(`${prefix}:`) && tested(id))])];
  const misses = evidence
    .filter((row) => row.outcome === "wrong")
    .slice(-15)
    .reverse()
    .map((row) => {
      const item = itemById.get(row.item);
      return { concept: row.concept, way: row.activity, at: iso(row.at), sentence: item ? storedSentence(item) : row.said, note: row.note };
    });
  const words = ids("w", WORDS).map((id) => ({ id, en: WORDS[id.slice(2)], ...state(id, lang, now) }));
  const metOnly = [...seenIds].filter((id) => id.startsWith("w:") && !tested(id)).length;
  const snapshot = {
    version: 1,
    language: lang,
    languageName: languageName(lang),
    from: learningFrom(),
    about:
      "language: the one they're learning (from: the one they know); every nl field holds text in it, whatever the language (the field keeps its name). level: 0 new (never practiced) … 4 strong. recall: the chance (%) they'd recall it now, by strength: read (understand it written), hear (understand it heard), say (produce it, typed or spoken). due: time to review it. slipping: due and it was known. leech: missed again and again; a contrast or a memory hook helps more than repeating it. Grade with these ids (p:<pattern>, c:<phrase>, w:<lemma>); new ids are fine.",
    // The shared grammar but its retired patterns (lang/grammar.js): no longer offered, though a tested one stays.
    patterns: ids("p", Object.fromEntries(Object.entries(PATTERNS).filter(([, p]) => !p.retired))).map((id) => ({ id, name: conceptLabel(id, PATTERNS), about: PATTERNS[id.slice(2)]?.about, ...state(id, lang, now) })),
    phrases: ids("c", CHUNKS).map((id) => ({ id, nl: CHUNKS[id.slice(2)]?.text, en: CHUNKS[id.slice(2)]?.en, ...state(id, lang, now) })),
    words,
    recentMisses: misses,
    examples: ITEMS.slice(0, 6).map((item) => ({ nl: storedSentence(item), literal: item.literal.map(([text, moved]) => (moved ? `*${text}*` : text)), en: item.means })),
    totals: { evidence: evidence.length, studied: seenIds.size, wordsMetNotTested: metOnly },
  };
  // Too big for the room: the words most worth steering to stay (due, slipping or a leech; then the weakest; then the most
  // recently tested), and the rest are left out (protocol.js fitLearner).
  return fitLearner(snapshot, LIMITS.snapshotBytes);
}

/** Sends the snapshot; failures don't matter (it's sent again next time). */
export function sendLearner() {
  // The sample learner isn't you: nothing of it reaches the practice room (study/sample-mode.js).
  if (sampleOn()) return Promise.resolve(null);
  return api("/api/practice/learner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(learnerSnapshot()) }).catch(() => null);
}
