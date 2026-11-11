// Requests for your AI: something you leave in the app for your own AI to pick up the next time it checks in over MCP
// (it can't be called from here: only it can call the site). The account's AI room (src/practice.ts) keeps them beside
// practices; this module is what a request is, checked the same way in the app and in the Worker.
//
// A request: { kind, …what that kind carries }, then its state:
//   waiting   left in the app; any AI of yours can take it (you can cancel it). Expires after 14 days.
//   taken     an AI has it (which, since when); back to waiting if that AI says nothing for an hour
//   done      what it did, in a line, with links to it (a pack and its changes, a theme, a practice), or an answer
//   couldnt   the AI says why not
//   canceled · expired
// The kinds (REQUEST_KINDS): practice, pack_add, pack_new, text_new, weave, look, ask. Each kind is one entry, so one can be left out
// without touching the rest. A question can carry what it's about (checkAbout: the sentence and your answer, word,
// concept, book or Translate search it was asked from), and its answer is plain text with the language's words marked
// [[like this]] (answerParts splits it for the screen). describeAsk is the same question as text to paste anywhere.

import { checkSettings, KINDS, PracticeError, text } from "../practice/protocol.js";
import { LANGUAGES } from "../lang/index.js";
import { WEAVE_LANGUAGES } from "../read/weave-languages.generated.js";

const PACK_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const CHANGE_ID = /^chg_[A-Za-z0-9_-]{6,40}$/;
const PLAIN_ID = /^[A-Za-z0-9_-]{4,64}$/;
const BOOK_ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
// An upload's id, as src/texts.ts takes one (a weave request's text: POST /api/ai/weave-texts).
const UPLOAD_ID = /^[A-Za-z0-9_-]{8,40}$/;
// A sentence's id as the app knows it: the item's own id, or "<pack>/<item>" for one from a pack that isn't the starter
// (pack-format.js buildView), each part an id.
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}(?:\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,79})?$/;
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
// A field as text, never coerced: JSON can carry an object whose toString is null, which String() throws on.
const plain = (value) => (typeof value === "string" ? value : "");

const DAY = 86_400_000;
export const REQUEST_TIMING = {
  expire: 14 * DAY, // a waiting request no AI took
  takenStale: 60 * 60_000, // a taken one whose AI said nothing goes back to waiting
  keepFinished: 30 * DAY, // done, couldn't, canceled or expired: shown this long, then forgotten
};
export const REQUEST_LIMITS = { what: 600, question: 2000, said: 400, why: 400, answer: 6000, open: 30, changes: 20 };
export const ABOUT_LIMITS = { where: 80, sentence: 300, literal: 400, word: 60, unit: 90, game: 40, answer: 300, title: 120, query: 400 };
const UNIT = /^([wpc]):(\S.{0,95})$/;
// A pack's own pattern ("<pack id>.<id>", pack-format.js): its name is in the pack, on the device, not here.
const OWN_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}\.[a-z0-9][a-z0-9-]{0,39}$/;
const UNIT_KINDS = { w: "word", p: "pattern", c: "phrase" };

/**
 * What a question is about, from where it was asked (all optional but the language):
 *   { language, where?       where it was asked: "study", "reader", "concept", "translate", or the screen in words
 *     sentence?: { id?, text, literal?, natural? }    a sentence: a pack item's id, the sentence, its literal line, its English
 *     game?, answer?, right?                           in Study: the game, what you answered, whether it was right
 *     word?: { text, lemma? }                          a word as written, and its dictionary form
 *     unit?                                            a concept: "w:<lemma>", "p:<pattern id>" or "c:<phrase id>"
 *     book?: { id, title, at? }                        a book, and the word it's at
 *     translate?: { query, from, to } }                a Translate search
 * Returns what's kept (unit as { id, kind, name? }: a pattern's name from the language's catalog), or throws a
 * PracticeError.
 */
export function checkAbout(value) {
  if (value === undefined || value === null) return undefined;
  const shape = "about must be { language, where?, sentence?, word?, pattern?, book?, translate? }.";
  if (!isObject(value)) throw new PracticeError(shape);
  const language = plain(value.language);
  if (!Object.hasOwn(LANGUAGES, language)) throw new PracticeError(`about.language must be one of ${Object.keys(LANGUAGES).join(", ")}.`);
  const out = { language };
  const where = text(value.where, ABOUT_LIMITS.where, "about.where");
  if (where) out.where = where;
  const part = (key, fields) => {
    if (value[key] === undefined || value[key] === null) return;
    if (!isObject(value[key])) throw new PracticeError(`about.${key} must be { ${fields} }.`);
    return value[key];
  };
  const sentence = part("sentence", "id?, text, literal?, natural?");
  if (sentence) {
    const id = sentence.id === undefined || sentence.id === null ? undefined : plain(sentence.id);
    if (id !== undefined && !ITEM_ID.test(id)) throw new PracticeError("about.sentence.id must be the sentence's id.");
    out.sentence = { ...(id ? { id } : {}), text: text(sentence.text, ABOUT_LIMITS.sentence, "about.sentence.text", { required: true }) };
    const literal = text(sentence.literal, ABOUT_LIMITS.literal, "about.sentence.literal");
    const natural = text(sentence.natural, ABOUT_LIMITS.sentence, "about.sentence.natural");
    if (literal) out.sentence.literal = literal;
    if (natural) out.sentence.natural = natural;
  }
  const word = part("word", "text, lemma?");
  if (word) {
    out.word = { text: text(word.text, ABOUT_LIMITS.word, "about.word.text", { required: true }) };
    const lemma = text(word.lemma, ABOUT_LIMITS.word, "about.word.lemma");
    if (lemma) out.word.lemma = lemma;
  }
  const game = text(value.game, ABOUT_LIMITS.game, "about.game");
  const answer = text(value.answer, ABOUT_LIMITS.answer, "about.answer");
  if (game) out.game = game;
  if (answer) out.answer = answer;
  if (value.right !== undefined && value.right !== null) {
    if (typeof value.right !== "boolean") throw new PracticeError("about.right must be true or false.");
    out.right = value.right;
  }
  if (value.unit !== undefined && value.unit !== null) {
    const match = plain(value.unit).match(UNIT);
    if (!match) throw new PracticeError('about.unit must be a concept: "w:<lemma>", "p:<pattern id>" or "c:<phrase id>".');
    const [id, letter, rest] = match;
    out.unit = { id, kind: UNIT_KINDS[letter] };
    if (letter === "p") {
      const patterns = LANGUAGES[language].patterns ?? {};
      if (!Object.hasOwn(patterns, rest) && !OWN_PATTERN.test(rest)) throw new PracticeError(`about.unit: ${LANGUAGES[language].name} has no pattern "${rest}"${Object.keys(patterns).length ? ` (${Object.keys(patterns).join(", ")})` : ""}.`);
      if (Object.hasOwn(patterns, rest)) out.unit.name = patterns[rest].name;
    }
  }
  const book = part("book", "id, title, at?");
  if (book) {
    if (!BOOK_ID.test(plain(book.id))) throw new PracticeError("about.book.id must be the book's id.");
    out.book = { id: book.id, title: text(book.title, ABOUT_LIMITS.title, "about.book.title", { required: true }) };
    if (book.at !== undefined && book.at !== null) {
      if (!Number.isInteger(book.at) || book.at < 0) throw new PracticeError("about.book.at must be a word's place in the book (0 or more).");
      out.book.at = book.at;
    }
  }
  const search = part("translate", "query, from, to");
  if (search) {
    const from = plain(search.from);
    const to = plain(search.to);
    if (!Object.hasOwn(LANGUAGES, from) || !Object.hasOwn(LANGUAGES, to) || (from === "en") === (to === "en")) throw new PracticeError('about.translate goes between "en" and a language: { query, from, to }.');
    out.translate = { query: text(search.query, ABOUT_LIMITS.query, "about.translate.query", { required: true }), from, to };
  }
  return out;
}

/**
 * The kinds of request, each with what it carries (check) and the app's words for it. name and about are what the app
 * shows; check(value) returns what's kept, or throws a PracticeError saying what's wrong. from: where it's asked, when that's
 * somewhere other than its own page in the AI section (#ai/new/<kind>).
 */
export const REQUEST_KINDS = {
  practice: {
    name: "Practice with me",
    about: "A practice in the app, the kind you pick: your AI starts it when it checks in.",
    check: (value) => {
      // checkSettings reads each field as text or a number; anything else (an object) is refused here first.
      if (isObject(value.practice) && Object.values(value.practice).some((field) => field !== null && typeof field === "object")) throw new PracticeError("practice must be { kind, answer?, topic?, minutes?, language? }.");
      return { practice: checkSettings(value.practice) };
    },
  },
  pack_add: {
    name: "Add to my pack",
    about: "More sentences in a pack of yours: what about, and whether to aim at what's due.",
    check: (value) => {
      const pack = plain(value.pack);
      if (!PACK_ID.test(pack)) throw new PracticeError("pack must be one of your packs' ids.");
      return { pack, packName: text(value.packName, 80, "packName") ?? pack, what: text(value.what, REQUEST_LIMITS.what, "what", { required: true }), due: value.due === true };
    },
  },
  pack_new: {
    name: "Make a new pack",
    about: "A pack for something you want to study on its own, like a trip.",
    check: (value) => {
      const language = plain(value.language);
      if (!Object.hasOwn(LANGUAGES, language)) throw new PracticeError(`language must be one of ${Object.keys(LANGUAGES).join(", ")}.`);
      return { what: text(value.what, REQUEST_LIMITS.what, "what", { required: true }), language };
    },
  },
  text_new: {
    name: "Add a text",
    about: "A text for Read: a story at your level, an article, a book from your computer.",
    check: (value) => {
      const language = plain(value.language);
      if (!Object.hasOwn(LANGUAGES, language)) throw new PracticeError(`language must be one of ${Object.keys(LANGUAGES).join(", ")}.`);
      return { what: text(value.what, REQUEST_LIMITS.what, "what", { required: true }), language };
    },
  },
  // A text of yours (pasted, or opened from a file: kept on the device only) with the language you're learning woven in. The device
  // sends the text up first (client.js askToWeave: an upload kept for this request alone); your AI reads it with get_text, and its
  // add_weave is checked as the shelf's weaves are (book-format.js validateWeave), finishes the request and goes to your devices
  // through the text relay (read/text-inbox.js, a "weave" change), each checking it again against the text it has.
  weave: {
    name: "Weave a text",
    about: "A text of yours with the language you're learning woven in at your level: read it woven in Read.",
    // Asked from the reader, on the text itself (reader.js offerWeave): no page in the AI section to write one by hand.
    from: "read",
    check: (value) => {
      const book = plain(value.book);
      if (!BOOK_ID.test(book)) throw new PracticeError("book must be the id of a text of yours.");
      const language = plain(value.language);
      if (!Object.hasOwn(LANGUAGES, language)) throw new PracticeError(`language must be one of ${Object.keys(LANGUAGES).join(", ")}.`);
      // Only into a language a text of yours can be woven into (weave-languages.generated.js), as the server.
      if (!WEAVE_LANGUAGES.includes(language)) throw new PracticeError("Weaving into that language isn't ready yet.");
      const upload = plain(value.upload);
      if (!UPLOAD_ID.test(upload)) throw new PracticeError("upload must be the id POST /api/ai/weave-texts gave for this text.");
      const title = text(value.title, 200, "title", { required: true });
      return { book, title, language, upload, what: `“${title}” into ${LANGUAGES[language].name}` };
    },
  },
  look: {
    name: "Change my look",
    about: "Colors, fonts and the feel of the app, as you describe it.",
    check: (value) => ({ what: text(value.what, REQUEST_LIMITS.what, "what", { required: true }), fresh: value.fresh === true }),
  },
  ask: {
    name: "Ask a question",
    about: "Anything about the language; the answer comes back here.",
    check: (value) => {
      const about = checkAbout(value.about);
      return { what: text(value.what, REQUEST_LIMITS.question, "what", { required: true }), ...(about ? { about } : {}) };
    },
  },
};

/** A request as the app sends it → { kind, …what it carries }, or a PracticeError. */
export function checkRequest(value) {
  if (!isObject(value)) throw new PracticeError("A request must be { kind, … }.");
  const kind = plain(value.kind);
  if (!Object.hasOwn(REQUEST_KINDS, kind)) throw new PracticeError(`kind must be one of ${Object.keys(REQUEST_KINDS).join(", ")}.`);
  return { kind, ...REQUEST_KINDS[kind].check(value) };
}

/**
 * How your AI finishes a request: { done: { said, links? } }, { couldnt: why }, or (for ask) { answer }. links:
 * { pack?, changes?: [change id], theme?, practice?, text? }, so the app can open what it made.
 */
export function checkFinish(value, kind) {
  if (!isObject(value)) throw new PracticeError("Finish with done: { said, links? }, couldnt: why" + (kind === "ask" ? ", or answer." : "."));
  const given = ["done", "couldnt", "answer"].filter((key) => value[key] !== undefined && value[key] !== null);
  if (given.length !== 1) throw new PracticeError("Give exactly one of done, couldnt" + (kind === "ask" ? " or answer." : "."));
  if (value.couldnt !== undefined && value.couldnt !== null) return { state: "couldnt", why: text(value.couldnt, REQUEST_LIMITS.why, "couldnt", { required: true }) };
  if (value.answer !== undefined && value.answer !== null) {
    if (kind !== "ask") throw new PracticeError("answer is for a question (ask); finish this one with done or couldnt.");
    return { state: "done", answer: text(value.answer, REQUEST_LIMITS.answer, "answer", { required: true }) };
  }
  const done = value.done;
  if (!isObject(done)) throw new PracticeError("done must be { said, links? }.");
  const said = text(done.said, REQUEST_LIMITS.said, "done.said", { required: true });
  const links = {};
  if (done.links !== undefined && done.links !== null) {
    if (!isObject(done.links)) throw new PracticeError("done.links must be { pack?, changes?, theme?, practice?, text? }.");
    const { pack, changes, theme, practice, text: textId } = done.links;
    if (pack !== undefined) {
      if (!PACK_ID.test(plain(pack))) throw new PracticeError("done.links.pack must be a pack's id.");
      links.pack = pack;
    }
    if (changes !== undefined) {
      if (!Array.isArray(changes) || changes.length > REQUEST_LIMITS.changes || !changes.every((c) => CHANGE_ID.test(plain(c)))) throw new PracticeError(`done.links.changes must be up to ${REQUEST_LIMITS.changes} change ids (chg_…).`);
      links.changes = [...changes];
    }
    for (const [key, raw] of [["theme", theme], ["practice", practice], ["text", textId]]) {
      if (raw === undefined) continue;
      if (!PLAIN_ID.test(plain(raw))) throw new PracticeError(`done.links.${key} must be its id.`);
      links[key] = raw;
    }
  }
  return { state: "done", said, ...(Object.keys(links).length ? { links } : {}) };
}

/**
 * An answer as the screen shows it: [{ text, language }], language true for what's marked [[like this]] (the
 * language's words). Plain text either way: the screen puts each part in as text, never as HTML. A marker left open
 * stays as it was typed.
 */
export function answerParts(answer) {
  const parts = [];
  const source = String(answer ?? "");
  const marked = /\[\[([^\[\]\n]{1,200})\]\]/g;
  let at = 0;
  for (const match of source.matchAll(marked)) {
    if (match.index > at) parts.push({ text: source.slice(at, match.index), language: false });
    parts.push({ text: match[1], language: true });
    at = match.index + match[0].length;
  }
  if (at < source.length) parts.push({ text: source.slice(at), language: false });
  return parts;
}

/**
 * A question with what it's about, as plain text to paste into any AI ("Copy the question"): the same input as
 * createRequest's ask ({ what, about? }), checked the same way. Throws a PracticeError when it doesn't pass.
 */
export function describeAsk(input) {
  const { what, about } = REQUEST_KINDS.ask.check(isObject(input) ? input : {});
  const name = LANGUAGES[about?.language]?.name ?? "a language";
  const lines = [`I'm learning ${about ? name : "a language"} with Lexicommons. ${what}`];
  if (about) {
    const context = [];
    if (about.sentence) {
      const s = about.sentence;
      context.push(`The sentence: "${s.text}"${s.literal ? ` (word for word: "${s.literal}")` : ""}${s.natural ? ` (in English: "${s.natural}")` : ""}.`);
    }
    if (about.answer !== undefined) context.push(`I answered "${about.answer}"${about.right === undefined ? "" : about.right ? ", which was right" : ", which was wrong"}${about.game ? ` (${about.game})` : ""}.`);
    else if (about.right !== undefined) context.push(`I got it ${about.right ? "right" : "wrong"}${about.game ? ` (${about.game})` : ""}.`);
    if (about.word) context.push(`The word: "${about.word.text}"${about.word.lemma && about.word.lemma !== about.word.text ? ` (dictionary form: "${about.word.lemma}")` : ""}.`);
    if (about.unit) context.push(about.unit.kind === "pattern" ? `The pattern: ${about.unit.name}.` : `The ${about.unit.kind}: "${about.unit.id.slice(2)}".`);
    if (about.book) context.push(`In the book "${about.book.title}"${about.book.at !== undefined ? `, at word ${about.book.at + 1}` : ""}.`);
    if (about.translate) context.push(`My Translate search: "${about.translate.query}" (${LANGUAGES[about.translate.from].name} to ${LANGUAGES[about.translate.to].name}), which found nothing.`);
    if (context.length) lines.push(context.join(" "));
    lines.push(`Please answer at my level, with an example or two in ${name} and their English.`);
  }
  return lines.join("\n\n");
}

/** A request in words, for lists: "Add to my pack: Travel · 20 sentences about cooking". */
export function describeRequest(request) {
  const kind = REQUEST_KINDS[request.kind];
  if (!kind) return request.kind;
  if (request.kind === "practice") return `${kind.name}: ${KINDS[request.practice?.kind]?.name ?? ""}`;
  if (request.kind === "pack_add") return `${kind.name}: ${request.packName} · ${request.what}`;
  return `${kind.name}: ${request.what}`;
}
