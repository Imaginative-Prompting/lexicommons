// A rule's own examples beside the sentence an idea's card already shows (after-answer.js conceptBody: More like it, More examples):
// never that sentence again. Compared as the language writes it, its case and marks aside, so "Wollen Sie einen Kaffee?" and
// "wollen sie einen kaffee" are one sentence, and Spanish's ¿ … ? count for nothing. With no sentence of yours on the card, the first
// example is the one in its picture, so it's the one left out. Pure, so Node's tests read it (scripts/test-rule-examples.mjs).
const asWritten = (text) =>
  String(text ?? "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s]+/gu, " ")
    .trim();

/** The examples a card may show beside its sentence (or beside its own picture's first example, with none): every other one, in order. */
export function examplesBeside(examples, sentence) {
  const list = Array.isArray(examples) ? examples : [];
  if (!sentence) return list.slice(1);
  const shown = asWritten(sentence);
  return list.filter((one) => asWritten(one?.text) !== shown);
}
