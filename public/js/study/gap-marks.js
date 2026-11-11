// A gap's word as written can carry punctuation on either side: a mark that closes something after it ("koffie," · "water." · "ja?")
// and, in Spanish and others, one that opens something before it ("¿Tenemos" · "¡Hola"). A choice is a word, so neither is part of
// it: the opening mark is drawn just before the gap and the closing one just after it (session.js, lx/ui.js fillSentence and
// typeInGap), and the answer is compared and said with both. Pure, so Node's tests read the same answer as the screens.

// What closes something after a word (koffie, · water. · ja? · "zei hij").
export const GAP_TAIL = /[.,;:!?…»”"')\]。？！、，]+$/u;
// What opens something before a word (¿Tenemos · ¡Hola · «Bonjour · „Hallo · “Now). Not the plain apostrophe: in Dutch it begins words
// of its own ('s avonds, 't), so a gap on one keeps it.
export const GAP_HEAD = /^[¿¡«“‘"(\[「『„‚‹]+/u;

/**
 * A gap word's marks: { head, bare, tail }, bare the word a choice is ("¿Tenemos" → "¿", "Tenemos", ""; "koffie," → "", "koffie", ",").
 * A word that is only marks keeps them as its word, so there's always something to choose.
 */
export function gapMarks(written) {
  const text = String(written ?? "");
  const tail = GAP_TAIL.exec(text)?.[0] ?? "";
  const rest = tail ? text.slice(0, -tail.length) : text;
  const head = GAP_HEAD.exec(rest)?.[0] ?? "";
  if (!rest.slice(head.length)) return { head: "", bare: rest, tail };
  return { head, bare: rest.slice(head.length), tail };
}

/** A choice as the gap shows it: without the gap word's own marks where it carries them ("¿Tienes" beside "¿Tenemos" → "Tienes"). */
export function bareChoice(text, { head = "", tail = "" } = {}) {
  let out = String(text ?? "");
  if (tail && out.endsWith(tail) && out.length > tail.length) out = out.slice(0, -tail.length);
  if (head && out.startsWith(head) && out.length > head.length) out = out.slice(head.length);
  return out;
}
