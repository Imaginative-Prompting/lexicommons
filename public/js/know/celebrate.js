// What a finished session celebrates (study/session.js draws it, at its summary): the moment today counted for the
// streak, mending yesterday, a rest day earned, and milestones (7, 30, 100 and 365 days in a row; 100, 500, 1,000,
// 2,500 and 5,000 words you'd recall). Pure: the streak before and after the session (know/streak.js streakOf's
// results) and the words you'd recall before and after, in; the moment, out. scripts/test-streak.mjs holds it.
// Never a loss: a session that didn't change the streak celebrates nothing about it, and a run that ended earlier is
// simply day 1 again.

export const DAY_MILESTONES = [7, 30, 100, 365];
export const WORD_MILESTONES = [100, 500, 1000, 2500, 5000];

/**
 * { counted (today now counts, and didn't before), days (the streak now), from (before), firstDay (a new run's day 1),
 *   mended (yesterday mended by today), restEarned (a rest day earned just now), milestone ({ kind: "days" | "words",
 *   n } or null: the biggest one crossed in this session) }.
 */
export function momentOf({ before, after, wordsBefore = 0, wordsAfter = 0 }) {
  const counted = before.state !== "done" && after.state === "done";
  const out = { counted, days: after.days, from: before.days, firstDay: counted && after.days === 1, mended: counted && before.state === "mend", restEarned: after.rest > before.rest, milestone: null };
  const days = DAY_MILESTONES.filter((n) => counted && before.days < n && after.days >= n).at(-1);
  const words = WORD_MILESTONES.filter((n) => wordsBefore < n && wordsAfter >= n).at(-1);
  // A streak milestone first (it's today's), else words.
  if (days) out.milestone = { kind: "days", n: days };
  else if (words) out.milestone = { kind: "words", n: words };
  return out;
}

/** The moment's words: a headline and a line under it. Plain, warm, never a warning. */
export function momentWords(m, lang = "") {
  if (m.milestone?.kind === "days") return { title: `${m.milestone.n} days in a row`, line: m.milestone.n >= 100 ? "That's a habit now." : "Every day counted." };
  if (m.milestone?.kind === "words") return { title: `${m.milestone.n.toLocaleString()} words`, line: `${lang ? `${lang} words` : "Words"} you'd recall now.` };
  if (!m.counted) return null;
  if (m.firstDay) return { title: "Day 1", line: "Today counts." };
  if (m.mended) return { title: `${m.days} days`, line: "Yesterday mended too." };
  if (m.restEarned) return { title: `${m.days} days`, line: "A rest day earned, for a day off." };
  return { title: `${m.days} days`, line: "Today counts." };
}
