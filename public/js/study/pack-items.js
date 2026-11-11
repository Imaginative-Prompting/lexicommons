// One kind of item (pack-format.js has the fields). Pure, with no language data, so the parser's worker can read the limits
// without the whole language registry, and the app and the Worker read an item with the same code.
//
// An item is as small as a text and what it means, or a whole sentence with everything the games need. What this file knows: when an
// item is a sentence (isSentence: the games of Study and everything else that reads sentences take only those), what a plain item may
// carry, and which games it can play (gamesOf). A plain item is scheduled on its own, as the unit k:<pack>/<id> (study/deck.js), and
// plays only what its own content can carry, so it's never given a grammar point, a wrong version or a gap nobody wrote.
//
// What a plain item may carry, beside text and means (only a cloze may have no means):
//   reading       how the text is said
//   sentence      a sentence in the pack's language that uses it, and sentenceBack what that sentence means (both or neither)
//   cloze         { at, answer, hint? }: the part of text to fill in, at its position in text (as written, counted in UTF-16
//                 units, as JavaScript counts them)

export const ITEM_LIMITS = {
  items: 5000, // in one pack
  side: 400, // characters in a text, a means or a sentence
  reading: 120,
  hint: 120,
  extras: 12, // other fields a deck carried, on one item
  extraLabel: 60,
  tags: 12,
  tag: 40,
  // What each game can draw.
  typed: 60, // a text you can be asked to type
  matched: 30, // a side that fits Match's tiles
  orderWords: { least: 3, most: 12 }, // words in a sentence you put in order
  orderWord: 24, // characters in one of its tiles
};

// The order an item's fields are kept in, so an item says the same in JSON however it got here.
const ITEM_ORDER = ["id", "copyOf", "topic", "concepts", "chunks", "text", "means", "reading", "words", "punct", "literal", "english", "moved", "wrong", "otherGender", "gap", "shapes", "sentence", "sentenceBack", "cloze", "extras", "tags"];

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** An item with its fields in the order they're kept, without any that are undefined. */
export function orderedItem(item) {
  const out = {};
  for (const key of ITEM_ORDER) if (item[key] !== undefined) out[key] = item[key];
  return out;
}

/** Whether an item is a sentence: it has all that Study's games and everything else that reads sentences need. */
export const isSentence = (item) =>
  Array.isArray(item?.words) && item.words.length >= 2 && Boolean(item.means) && Array.isArray(item.literal) && item.literal.length > 0 && Array.isArray(item.wrong) && item.wrong.length > 0 && isObject(item.gap) && (item.concepts?.length > 0 || item.chunks?.length > 0);

/** A pack's sentences. */
export const sentencesOf = (pack) => (pack?.items ?? []).filter(isSentence);

/** A pack's plain items: the rest, which a session on the pack plays (study/deck.js). */
export const plainItems = (pack) => (pack?.items ?? []).filter((item) => !isSentence(item));

/**
 * An item as written before version 2, as version 2: its nl is words, its natural is means, its patterns are concepts, and a
 * card's front and back are text and means. A sentence's text is its words joined by `separator`, then its punct; with no
 * separator (a change, which doesn't say its language) it's left for the check to work out. Anything that isn't an item comes back as it is.
 */
export function upgradeItem(item, separator) {
  if (!isObject(item)) return item;
  const { nl, natural, patterns, front, back, ...rest } = item;
  const text = Array.isArray(nl) ? (typeof separator === "string" ? `${nl.map((word) => (Array.isArray(word) ? word[0] : "")).join(separator)}${typeof item.punct === "string" ? item.punct : ""}` : undefined) : front;
  return orderedItem({ ...rest, concepts: patterns ?? rest.concepts, text: text ?? rest.text, means: natural ?? back ?? rest.means, words: nl ?? rest.words });
}

/** What a plain item may carry (see the top), as it'd be kept: every problem goes to r (pack-format.js's reporter). */
export function checkPlainFields(value, text, at, name, r) {
  const out = {};
  const reading = r.text(value.reading, `${at}.reading`, ITEM_LIMITS.reading);
  if (reading) out.reading = reading;
  const sentence = r.text(value.sentence, `${at}.sentence`, ITEM_LIMITS.side);
  const sentenceBack = r.text(value.sentenceBack, `${at}.sentenceBack`, ITEM_LIMITS.side);
  if (Boolean(sentence) !== Boolean(sentenceBack)) r.error(`${at}.sentence`, `${name}: a sentence needs what it means (sentenceBack), and sentenceBack a sentence.`);
  if (sentence && sentenceBack) Object.assign(out, { sentence, sentenceBack });
  if (value.cloze !== undefined) {
    const c = value.cloze;
    if (!isObject(c)) r.error(`${at}.cloze`, `${name}: cloze must be { at, answer, hint? }.`);
    else {
      const answer = r.text(c.answer, `${at}.cloze.answer`, ITEM_LIMITS.side, { required: true });
      const hint = r.text(c.hint, `${at}.cloze.hint`, ITEM_LIMITS.hint);
      if (!Number.isInteger(c.at) || c.at < 0) r.error(`${at}.cloze.at`, `${name}: cloze.at must be a position in text.`);
      else if (text !== undefined && answer !== undefined && text.slice(c.at, c.at + answer.length) !== answer) r.error(`${at}.cloze.at`, `${name}: cloze.answer isn't at cloze.at in text.`);
      out.cloze = { at: c.at, answer, ...(hint ? { hint } : {}) };
    }
  }
  // Whatever else a deck carried: only ever shown as text, under More on this card, and part of a shared pack like its sides.
  if (value.extras !== undefined) {
    if (!Array.isArray(value.extras)) r.error(`${at}.extras`, `${name}: extras must be a list of { label, text }.`);
    else {
      if (value.extras.length > ITEM_LIMITS.extras) r.error(`${at}.extras`, `${name}: extras has ${value.extras.length}; keep it to ${ITEM_LIMITS.extras}.`);
      const extras = value.extras.slice(0, ITEM_LIMITS.extras).flatMap((extra, n) => {
        if (!isObject(extra)) {
          r.error(`${at}.extras[${n}]`, `${name}: extras[${n}] must be { label, text }.`);
          return [];
        }
        const label = r.text(extra.label, `${at}.extras[${n}].label`, ITEM_LIMITS.extraLabel, { required: true });
        const said = r.text(extra.text, `${at}.extras[${n}].text`, ITEM_LIMITS.side, { required: true });
        return label && said ? [{ label, text: said }] : [];
      });
      if (extras.length) out.extras = extras;
    }
  }
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags)) r.error(`${at}.tags`, `${name}: tags must be a list of words.`);
    else {
      if (value.tags.length > ITEM_LIMITS.tags) r.error(`${at}.tags`, `${name}: tags has ${value.tags.length}; keep it to ${ITEM_LIMITS.tags}.`);
      const tags = value.tags.slice(0, ITEM_LIMITS.tags).flatMap((tag, n) => {
        const said = r.text(tag, `${at}.tags[${n}]`, ITEM_LIMITS.tag, { required: true });
        return said ? [said] : [];
      });
      if (tags.length) out.tags = tags;
    }
  }
  return out;
}

/** A sentence's tiles for Word order, or null when it can't be split safely: only where words are split by spaces. */
export function orderWords(text, { separator = " " } = {}) {
  if (separator !== " " || typeof text !== "string") return null;
  const words = text.trim().split(/\s+/);
  const { least, most } = ITEM_LIMITS.orderWords;
  if (words.length < least || words.length > most) return null;
  if (words.some((word) => word.length > ITEM_LIMITS.orderWord || !/[\p{L}\p{N}]/u.test(word))) return null;
  return words;
}

// What a plain item's Word order is on: its own sentence, or a text that's a sentence itself. A text needs a means to say what it
// means, and it's a sentence only when it looks like one: it ends as one, or has more words than a term would.
function orderSource(item, separator) {
  if (item.cloze) return null;
  if (item.sentence) {
    const words = orderWords(item.sentence, { separator });
    if (words) return { words, means: item.sentenceBack };
  }
  if (!item.means) return null;
  const words = orderWords(item.text, { separator });
  if (!words) return null;
  return /[.?!…。？！]$/.test(item.text) || words.length >= 5 ? { words, means: item.means } : null;
}

/** The words and meaning of a plain item's Word order, or null when it has none. */
export const orderOf = (item, { separator = " " } = {}) => orderSource(item, separator);

/**
 * The games a plain item can carry, given the rest of its pack: what it has decides, and nothing's made up.
 *   others   { means, answers }: how many other different means, and other different cloze answers, the pack's plain items have
 *   sound    whether its sound is on this device
 *   separator  what joins the language's words
 */
export function gamesOf(item, { others = { means: 0, answers: 0 }, sound = false, separator = " " } = {}) {
  const games = [];
  if (item.cloze) {
    games.push("fill");
    if (sound && item.means && others.means >= 2) games.push("listen");
    return games;
  }
  games.push("card");
  if (item.text.length <= ITEM_LIMITS.typed) games.push("type");
  if (item.text.length <= ITEM_LIMITS.matched && item.means.length <= ITEM_LIMITS.matched) games.push("match");
  if (others.means >= 3) games.push("choose");
  if (sound && others.means >= 2) games.push("listen");
  if (orderSource(item, separator)) games.push("arrange");
  return games;
}

/** How many other different means and cloze answers each of these items has around it. */
export function itemOthers(items) {
  const means = new Set(items.filter((item) => item.means).map((item) => item.means));
  const answers = new Set(items.filter((item) => item.cloze).map((item) => item.cloze.answer));
  return (item) => ({ means: means.size - (item.means && means.has(item.means) ? 1 : 0), answers: answers.size - (item.cloze && answers.has(item.cloze.answer) ? 1 : 0) });
}
