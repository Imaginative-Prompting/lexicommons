// Which units a word-by-word answer is evidence for (the speech matcher's result: typed, or heard by a recognizer),
// shared by Study's games and your AI's cards so the same answer always counts the same way.

/**
 * An outcome per word lemma: words is the sentence's [text, lemma] pairs, in the matcher's order. A word said in the
 * wrong place was still known: the slip is the pattern's (orderOutcome). A word that appears twice (bel … op) is wrong
 * if either is. spoken: a recognizer's near miss ("close") counts as said; typed, it's a wrong form.
 */
export function wordOutcomes(words, result, { spoken = false } = {}) {
  // The other gender's sentence, right (study/subjects.js asWritten): every word of the sentence known, read off as it was put.
  if (result?.evidence) return { ...result.evidence };
  const out = {};
  result?.words.forEach((word, i) => {
    const lemma = words[i]?.[1];
    // A subject the answer left out where the language may (study/subjects.js): shown in its place, but no evidence it was known.
    if (!lemma || word.optional) return;
    const said = word.result === "right" || word.result === "order" || (spoken && word.result === "close");
    out[lemma] = out[lemma] === "wrong" || !said ? "wrong" : "right";
  });
  return out;
}

/** Every word wrong: an answer given up on, or nothing heard. */
export const allWrong = (words) => Object.fromEntries(words.filter(([, lemma]) => lemma).map(([, lemma]) => [lemma, "wrong"]));

/**
 * The patterns' outcome from a word-by-word result: a word in the wrong place is a word-order slip; every word in its
 * place is right; words missing with nothing out of place says nothing about the order (met).
 */
export function orderOutcome(result) {
  if (!result) return "wrong";
  if (result.words.some((word) => word.result === "order")) return "wrong";
  return result.words.every((word) => word.result !== "missing") ? "right" : "met";
}

/** A typed answer is right only word for word (accents aside, when forgiving): a near miss is a wrong form. */
export const typedRight = (result) => result.words.every((word) => word.result === "right") && result.extra.length === 0;

// ---------- what a wrong answer says about each pattern ----------

const plainWord = (word) => (typeof word === "string" ? word : word?.text ?? "").toLocaleLowerCase().replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");

/**
 * What kind of slip one sentence is against the right one, word by word: { kind: "order", at } when it's the same words in another order, { kind: "form", at } when other words stand in the same
 * places, null when it's neither or both, or they aren't the same length. at: the positions that differ.
 */
export function slipBetween(right, given) {
  const a = right.map(plainWord);
  const b = given.map(plainWord);
  if (a.length !== b.length || !a.length) return null;
  const at = a.flatMap((word, i) => (word === b[i] ? [] : [i]));
  if (!at.length) return null;
  const left = [...a];
  let replaced = 0;
  for (const word of b) {
    const i = left.indexOf(word);
    if (i >= 0) left.splice(i, 1);
    else replaced++;
  }
  if (!replaced) return { kind: "order", at };
  return replaced === at.length ? { kind: "form", at } : null;
}

/** The slip in a word-by-word result: words in the wrong place; else, typed, words in a wrong form. (Said, a near miss counts as said, wordOutcomes.) */
export function slipOfResult(result, { spoken = false } = {}) {
  const misplaced = result.words.flatMap((word, i) => (word.result === "order" ? [i] : []));
  if (misplaced.length) return { kind: "order", at: misplaced };
  if (spoken) return null;
  const off = result.words.flatMap((word, i) => (word.result === "close" || word.result === "wrong" ? [i] : []));
  return off.length ? { kind: "form", at: off } : null;
}

/**
 * Each pattern's outcome from an answer: { <concept>: outcome }. overall is what the game says of the whole; slip, what kind of mistake it was, when that's known. A word-order slip says nothing about a form, and
 * a wrong form says nothing about the order. Where the sentence has notes (marks: { <concept>: positions }), a slip counts only against a concept on the words it touched. With no slip known, or nothing to go
 * on, it's overall for all of them, as it always was. If a word-order slip would blame no pattern about order, it blames them all: something about the order was wrong.
 * A word typed in a wrong form with everything in its place is right on the order; only with notes can it say which form it missed.
 */
export function patternOutcomes(concepts, overall, slip, { kindOf = () => "order", marks = null } = {}) {
  const all = (outcome) => Object.fromEntries(concepts.map((id) => [id, outcome]));
  if (!slip || overall === "met") return all(overall);
  const touched = (id) => (marks?.[id] ?? []).some((at) => slip.at?.includes(at));
  const narrowed = Boolean(marks && slip.at);
  if (slip.kind === "form") {
    const aboutForm = (id) => kindOf(id) !== "order";
    if (overall === "right") return Object.fromEntries(concepts.map((id) => [id, aboutForm(id) && narrowed && touched(id) ? "wrong" : "right"]));
    return Object.fromEntries(concepts.map((id) => [id, !aboutForm(id) ? "met" : !narrowed || touched(id) ? "wrong" : "met"]));
  }
  if (overall !== "wrong") return all(overall);
  const about = concepts.filter((id) => kindOf(id) !== "form");
  const blamed = narrowed ? about.filter(touched) : about;
  const wrong = new Set(blamed.length ? blamed : about);
  return Object.fromEntries(concepts.map((id) => [id, wrong.has(id) ? "wrong" : "met"]));
}
