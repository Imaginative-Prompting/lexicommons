// An idea told in parts (lang/idea-parts.<code>.js): what its card says for the words you know, and which part a lesson brings.
// An idea with no parts there keeps its lesson's line. Pure, so Node's tests read the same answer as the screens.
import nl from "../lang/idea-parts.nl.js";
import es from "../lang/idea-parts.es.js";
import fr from "../lang/idea-parts.fr.js";
import de from "../lang/idea-parts.de.js";
import pt from "../lang/idea-parts.pt.js";
import it from "../lang/idea-parts.it.js";

const PARTS = { nl, es, fr, de, pt, it };

/** An idea's parts in a language, [{ words, line }] in the order they come, or null when it isn't told in parts. */
export const partsOf = (language, pattern) => PARTS[language]?.[pattern] ?? null;

/**
 * What an idea's card says when known(lemma) is what you know: its first part, then each later part whose words you all know,
 * joined. Null when the idea isn't told in parts (the caller keeps its lesson's line).
 */
export function ideaLine(language, pattern, known) {
  const parts = partsOf(language, pattern);
  if (!parts) return null;
  return parts
    .filter((part, i) => i === 0 || part.words.every((word) => known(word)))
    .map((part) => part.line)
    .join("; ");
}

/** What an idea's card is called when known(lemma) is what you know: the name of the last part it says; null when it isn't told in parts. */
export function ideaName(language, pattern, known) {
  const parts = partsOf(language, pattern);
  if (!parts) return null;
  return parts.filter((part, i) => i === 0 || part.words.every((word) => known(word))).at(-1).name ?? null;
}

/**
 * The later parts a lesson brings: for each idea told in parts, a part (after the first) one of whose words the lesson teaches
 * (inLesson(lemma)) and all of whose words you know once it's done (known(lemma) or inLesson(lemma)). [{ pattern, part, words }],
 * part its index (1 for the second).
 */
export function partsBrought(language, known, inLesson) {
  const out = [];
  for (const [pattern, parts] of Object.entries(PARTS[language] ?? {})) {
    parts.forEach((part, i) => {
      if (i === 0 || !part.words.some((word) => inLesson(word))) return;
      if (part.words.every((word) => known(word) || inLesson(word))) out.push({ pattern, part: i, words: part.words });
    });
  }
  return out;
}
