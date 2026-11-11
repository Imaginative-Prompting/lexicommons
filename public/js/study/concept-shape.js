// What a rule's picture shows (study/concept-picture.js draws it): which words are lit, what goes with what, a word's place in its clause,
// a word's ending, and the lines that say it. Pure: it loads in plain Node (scripts/test-concept-shape.mjs) and touches no screen.
//
// It reads a sentence's marks (its notes, or an example's own) and, when the notes have them, what each word is doing (its role, in plain
// words: "helping verb", "the word for the", "introduces the reason") and its dictionary form. The roles are free text, so everything here
// is careful: where they don't say enough, nothing is drawn beyond the lit words, never a guess. docs/design-bible.md, A rule's picture.

// A word and the punctuation after it, apart: the punctuation stays outside what's lit.
export const split = (word) => /^(.*?)([.,!?;:…"”’)。、！？」』،؟؛]*)$/su.exec(String(word ?? "")).slice(1);
const bare = (word) => String(word ?? "").toLocaleLowerCase().replace(/[.,!?;:’'“”"()¿¡]/g, "");

// A word that leads into the next one and makes one part of the sentence with it: de, een, mijn, in, a describing word before its noun.
const LEADS = /^(the )?word for (the|a)$|^(shows )?whose |^points (out which|to (?!the |a ))\b|^introduces (the (place|time|destination|topic)|a noun)$|^marks clock time$/;
// A word that sends the verb to the end of its clause (dat, omdat, als, terwijl, voordat, die), by the roles the notes give them.
const SENDS = /^introduces (the (thought|reason|condition|explanation|question|starting time)|the unknown \w+|what's (known|hoped|checked)|what seems true)|^links (back to |the reason|things in time|the times)|^starts (a|the) condition/;
// A word that joins two whole sentences and stands outside both (en, maar, want): never counted as a part.
const JOINS = /^joins |^connects /;
const VERB = /verb$/;
const FINITE = /^(the verb|helping verb|command verb)$/;

/** The word's clause, as { from, to, sub }: between commas or sentence ends, a joining word, or a word like dat that starts one (sub: it does). */
function clauseOf(at, roles, words) {
  let from = at;
  while (from > 0 && !SENDS.test(roles[from] ?? "") && !/[,;:.!?]$/.test(words[from - 1]) && !JOINS.test(roles[from - 1] ?? "")) from--;
  let to = at;
  while (to < words.length - 1 && !/[,;:.!?]$/.test(words[to]) && !JOINS.test(roles[to + 1] ?? "") && !SENDS.test(roles[to + 1] ?? "")) to++;
  return { from, to, sub: SENDS.test(roles[from] ?? "") };
}

/** The parts of words from..to, in order, as [first word, last word]: each word with the words that lead into it, by what they do. */
function groupsIn(roles, from, to) {
  const groups = [];
  let start = from;
  for (let i = from; i <= to; i++) {
    const role = roles[i] ?? "";
    const leads = i < to && (LEADS.test(role) || (role === "describing word" && /described/.test(roles[i + 1] ?? "")));
    if (!leads) groups.push([start, i]), (start = i + 1);
  }
  return groups;
}

/** The parts of a word's own clause, counted as Dutch counts the verb's seat: everything before the clause's verb is its first part (a
 * clause like "Als hij valt," before it too), the verb the next, then the rest part by part. A word set off before a comma (Ja, Nee) and a
 * joining word stand outside. Null where counting says nothing: inside a clause dat starts, or a clause with no verb the notes name. */
function seatsAround(at, roles, words) {
  const clause = clauseOf(at, roles, words);
  if (clause.sub || JOINS.test(roles[at] ?? "")) return null;
  let verb = -1;
  for (let i = clause.from; i <= clause.to && verb < 0; i++) if (FINITE.test(roles[i] ?? "")) verb = i;
  if (verb < 0) return null;
  const seats = [];
  if (clause.from > 0 && /,$/.test(words[clause.from - 1])) {
    const before = clauseOf(clause.from - 1, roles, words);
    if (before.sub) seats.push([before.from, before.to]);
    // A verb straight after a comma, after a clause the notes don't say is one like "Als hij valt": first (Kom, …) or second (Zoals je
    // weet, drink ik …)? Not counted.
    else if (verb === clause.from) return null;
  }
  if (verb > clause.from) seats.push([clause.from, verb - 1]);
  if (seats.length > 1) return null; // a clause before it and words before the verb as well: not a count worth showing
  seats.push([verb, verb], ...groupsIn(roles, verb + 1, clause.to));
  return seats;
}

/** The rule's other piece, for a word the notes mark alone: what its own role points at, by the roles' words. Null when they don't say. */
function partnerOf(kind, at, roles, words) {
  const role = roles[at] ?? "";
  const before = (test) => {
    for (let i = at - 1; i >= 0; i--) if (test(roles[i] ?? "", i)) return i;
    return null;
  };
  const after = (test) => {
    for (let i = at + 1; i < roles.length; i++) if (test(roles[i] ?? "", i)) return i;
    return null;
  };
  if (kind === "order") {
    // Within the word's own clause: a verb at the end goes with the verb in the second seat (heb … gewerkt, neem … mee); a verb that ends a
    // clause a word like dat or omdat starts goes with that word (dat … kunnen eten); dat or omdat, with the verb that ends its clause; om,
    // with its te-verb at the end. Anything else, a lone helping verb too (kun in "Kun je …?"), is about its place, and is numbered instead.
    const { from, to } = clauseOf(at, roles, words);
    const back = (test) => {
      for (let i = at - 1; i >= from; i--) if (test(roles[i] ?? "")) return i;
      return null;
    };
    const verbsOnlyAfter = (i) => roles.slice(i + 1, to + 1).every((r) => VERB.test(r ?? ""));
    if (/^(main verb|second verb)$|^part of |other part$/.test(role)) return back((r) => /^(the verb|helping verb)$/.test(r));
    if (/^(the verb|helping verb)$/.test(role)) return from < at && SENDS.test(roles[from] ?? "") && verbsOnlyAfter(at) ? from : null;
    if (SENDS.test(role)) {
      for (let i = to; i > at; i--) if (VERB.test(roles[i] ?? "")) return verbsOnlyAfter(i) ? i : null;
      return null;
    }
    if (/^introduces the purpose$|^links \S+ to \S+$|^links to /.test(role) && to > at + 1 && VERB.test(roles[to] ?? "")) return to;
    return null;
  }
  if (kind === "agreement") {
    // A verb agrees with who or what does it: just before it (ik ben), or just after when it comes first (ben je). A word whose role
    // names another word of the sentence (points back to ik, describes koffie) goes with that word; a whose or which word, with its noun;
    // a describing word, with what it describes, the sentence's subject.
    const subject = (r) => /^(who|what)\b|fills the it place/.test(r) && !/^what's being (drunk|eaten|read|seen|made)/.test(r);
    const nearSubject = () => {
      if (at > 0 && subject(roles[at - 1] ?? "")) return at - 1;
      for (let i = at + 1; i < Math.min(roles.length, at + 3); i++) if (subject(roles[i] ?? "")) return i;
      return before(subject) ?? after(subject);
    };
    if (VERB.test(role)) return nearSubject();
    const named = words.findIndex((word, i) => i !== at && bare(word).length > 1 && ` ${bare(role)} `.includes(` ${bare(word)} `));
    if (named >= 0) return named;
    if (/^(whose|which|points out|shows whose)\b/.test(role)) return after((r, i) => i > at && !/^describ/.test(r));
    if (/^describ/.test(role)) return nearSubject();
    return null;
  }
  if (kind === "article") {
    // Its noun: the next word, past a describing word.
    const next = after((r, i) => i > at && !/^describ/.test(r));
    return next ?? (at + 1 < words.length ? at + 1 : null);
  }
  return null;
}

/**
 * A literal line's chunks as text: an item's literal is [text, moved?] chunks (pack-format.js), an example's a line of words. Never the
 * moved flag as a word.
 */
export const literalChunks = (literal) =>
  Array.isArray(literal) ? literal.map((chunk) => String((Array.isArray(chunk) ? chunk[0] : chunk) ?? "")) : literal ? String(literal).split(" ") : [];

/**
 * A word's ending against its dictionary form, as { stem, ending, lemma }: werkt, werken: werk + t. The word's own letters, split where the
 * ending starts, so a spelling change stays in the stem's part (verhalen: verhal + en, groter: grot + er, lees: lees, raakt: raak + t). A
 * form that's the dictionary word cut short has no ending (zit, of zitten: the ik form). Null when they don't share a start worth showing.
 */
export function endingOf(word, lemma) {
  const w = split(word)[0];
  const l = String(lemma ?? "");
  if (!w || !l || bare(w) === bare(l)) return null;
  const lower = (c) => (c ?? "").toLocaleLowerCase();
  const vowel = (c) => /[aeiouyáéíóúàèëïöüâêîôû]/i.test(c ?? "");
  let n = 0;
  while (n < w.length && n < l.length && lower(w[n]) === lower(l[n])) n++;
  if (n < 2) return null;
  // A vowel written twice where the dictionary word has it once is the stem's, with the consonant after it when the dictionary word has
  // one there (lezen: lees; raken: raak + t).
  if (n < w.length && vowel(w[n]) && lower(w[n]) === lower(w[n - 1])) {
    n++;
    if (n < w.length && !vowel(w[n]) && !vowel(l[n - 1])) n++;
  }
  // A consonant written twice (spul: spullen, wit: witte), or one after a vowel the dictionary word writes twice (verhaal: verhalen, groot:
  // groter), is the stem's: the ending starts at the vowel after it.
  const doubled = !vowel(w[n]) && lower(w[n]) === lower(w[n - 1]);
  const undoubled = vowel(w[n - 1]) && lower(l[n]) === lower(w[n - 1]);
  if (w.length - n >= 2 && !vowel(w[n]) && vowel(w[n + 1]) && (doubled || undoubled)) n++;
  // Longer than an ending is: the word as it is, nothing set apart.
  if (w.length - n > 3) n = w.length;
  return { stem: w.slice(0, n), ending: w.slice(n), lemma: l };
}

/**
 * The shape of one sentence's rule. kind: the concept's picture (order, or frame or place for order said exactly; ending, agreement,
 * article) or nothing; words: the sentence split
 * on spaces; marks: places in words the rule is about; roles, lemmas: per word, when known. Returns
 * { lit, pieces, pairs, seats, litSeat, place, endings, said }:
 * - lit: the marked places; pieces: those and the words they go with;
 * - pairs: [a, b] left to right: a bracket from a to b (order), an arc (agreement, a verb's ending to who), a box (article);
 * - seats: the parts of the lit word's clause, [first word, last word] each, when its place is first, second or last; litSeat its index;
 *   place: "first", "second" or "last", or null;
 * - endings: Map place → { stem, ending, lemma } (ending);
 * - said: the lines under the picture, { line, parts }: line one of ending, endingFor, goesWith, closes, closesEach, placeRole (place:
 *   first, second or last); parts by name (dictionary, word, who, other, role, place: text; an ending line's word is { text, spans }:
 *   the word with the character spans that changed).
 */
export function ruleShape({ kind: given, words, marks = [], roles = [], lemmas = [] }) {
  // A rule about order is a frame (two parts around the middle: never counted) or a place (where one word sits: never bracketed), when
  // the concept says which; "order" alone is worked out from the roles.
  const kind = given === "frame" || given === "place" ? "order" : given;
  const lit = new Set(marks.filter((at) => Number.isInteger(at) && at >= 0 && at < words.length));
  const litOrder = [...lit].sort((a, b) => a - b);
  const inside = (at) => at != null && at >= 0 && at < words.length;
  const known = roles.length === words.length;
  // What goes with what. An article, each with its own noun (the next word, past a describing word, when nothing says more); agreement,
  // the one marked word with what it agrees with, or two marked words with each other; order, the marks as they come (two pairs when
  // there are four: ben … gebleven, heb gewacht), or the one mark with the word the roles say it goes with; a verb's ending, with who.
  let pairs = [];
  if (kind === "article") pairs = litOrder.map((at) => [at, known ? partnerOf(kind, at, roles, words) : at + 1]).filter(([, b]) => inside(b) && !lit.has(b));
  else if (kind === "agreement" && litOrder.length === 1) pairs = known ? [[litOrder[0], partnerOf(kind, litOrder[0], roles, words)]].filter(([, b]) => inside(b)) : [];
  else if (kind === "agreement" && litOrder.length === 2) pairs = [litOrder];
  else if (given === "place") pairs = [];
  else if (kind === "order" && litOrder.length === 1) pairs = known ? [[partnerOf(kind, litOrder[0], roles, words), litOrder[0]]].filter(([a]) => inside(a)) : [];
  else if (kind === "order" && litOrder.length >= 4 && litOrder.length % 2 === 0) for (let i = 0; i < litOrder.length; i += 2) pairs.push([litOrder[i], litOrder[i + 1]]);
  // Marks side by side (Morgen ga ik) aren't two parts around a middle: they're lit, and that's all.
  else if (kind === "order" && litOrder.length >= 2 && litOrder.at(-1) - litOrder[0] >= litOrder.length) pairs = [[litOrder[0], litOrder.at(-1)]];
  else if (kind === "ending" && known)
    pairs = litOrder
      .filter((at) => VERB.test(roles[at] ?? "") && endingOf(words[at], lemmas[at]))
      .map((at) => [partnerOf("agreement", at, roles, words), at])
      .filter(([a]) => inside(a) && !lit.has(a));
  // Said with the marked word first (bent goes with je); drawn left to right.
  const named = pairs.map(([a, b]) => (lit.has(a) || !lit.has(b) ? [a, b] : [b, a]));
  pairs = pairs.map((pair) => [...pair].sort((a, b) => a - b));
  // A bracket runs on to the verb that ends its clause (dat … kunnen eten).
  if (kind === "order")
    pairs = pairs.map(([a, b]) => {
      while (b < words.length - 1 && !/[,;:.!?]$/.test(words[b]) && VERB.test(roles[b + 1] ?? "")) b++;
      return [a, b];
    });
  const pieces = [...new Set([...litOrder, ...pairs.flat()])].sort((a, b) => a - b);
  // A rule about one word's place (the verb first in a question, second in a statement, last in a clause): the parts of its clause, shown
  // only where the word is first, second or last, the places a rule talks about. Only with every word's role known.
  let seats = kind === "order" && given !== "frame" && pieces.length === 1 && !pairs.length && known && roles.every(Boolean) ? seatsAround(pieces[0], roles, words) : null;
  let litSeat = seats ? seats.findIndex(([a, b]) => a <= pieces[0] && pieces[0] <= b) : -1;
  const place = litSeat === 0 ? "first" : litSeat === 1 ? "second" : litSeat > 1 && litSeat === seats.length - 1 ? "last" : null;
  if (!place) (seats = null), (litSeat = -1);
  const endings = kind === "ending" ? new Map(litOrder.map((at) => [at, endingOf(words[at], lemmas[at])]).filter(([, e]) => e)) : new Map();

  // A word as a line says it: without its punctuation, and the sentence's capital off when its dictionary form has none (je, not Je).
  const asSaid = (at) => {
    const core = split(words[at])[0].replace(/^[¿¡"“‘(]+/, "");
    return at === 0 && lemmas[0] && lemmas[0] === lemmas[0].toLocaleLowerCase() ? core.charAt(0).toLocaleLowerCase() + core.slice(1) : core;
  };
  // Who an ending is for: the whole part of the sentence (mijn moeder, not moeder).
  const partOf = (at) => {
    const group = known ? groupsIn(roles, 0, words.length - 1).find(([a, b]) => a <= at && at <= b) : null;
    return group ? Array.from({ length: group[1] - group[0] + 1 }, (_, n) => asSaid(group[0] + n)).join(" ") : asSaid(at);
  };
  const said = [];
  for (const [at, e] of endings) {
    const who = pairs.find((pair) => pair.includes(at))?.find((other) => other !== at);
    const word = { text: e.stem + e.ending, spans: e.ending ? [[e.stem.length, e.stem.length + e.ending.length]] : [] };
    said.push(who != null ? { line: "endingFor", parts: { dictionary: e.lemma, word, who: partOf(who) } } : { line: "ending", parts: { dictionary: e.lemma, word } });
  }
  if (kind === "agreement" || kind === "article") for (const [a, b] of named) said.push({ line: "goesWith", parts: { word: asSaid(a), other: asSaid(b) } });
  if (kind === "order" && pairs.some(([a, b]) => b - a > 1)) said.push({ line: pairs.length > 1 ? "closesEach" : "closes", parts: {} });
  if (kind === "order" && place) said.push({ line: "placeRole", parts: { word: asSaid(pieces[0]), role: roles[pieces[0]], place } });
  const unique = said.filter((one, i) => said.findIndex((other) => JSON.stringify(other) === JSON.stringify(one)) === i);
  return { lit, pieces, pairs, seats, litSeat, place, endings, said: unique };
}

// ---------- marks: what a picture draws, in any language ----------
//
// A picture is a list of marks over a sentence's words (indices into its words, as the item has them; a word span [first, last] is
// inclusive) and, inside one word, character spans ([start, end) in the word as written, like String.slice). A pack can give an item's
// own (item.shapes, checked by shape-marks.js, which has the exact form); a pack's marks for a concept replace these, and Dutch's notes
// give them through ruleShape above (marksOf) only where the pack gives none. The shapes:
//   lit     { words }                       words lit
//   frame   { from, to }                    a bracket under the words from one to the other (inclusive), carried across lines
//   link    { from, to, fromChars?, toChars? }   an arc from a word to a word, an end on characters when it has them
//   affix   { word, chars: [[s, e], …] }    the characters that change, anywhere in the word (a prefix, an ending, an infix, a root)
//   box     { from, to }                    words that go together, boxed (from…to, inclusive)
//   places  { parts, mark, place? }         a clause's parts numbered, one ringed; place: first, second or last
//   tag     { word, text }                  a small label over a word (a particle's job)
// and on any of them, note: a line under the picture, in the pack's own words.

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, n) => a + n);

/** Dutch's picture as marks, with the lines that say it: ruleShape's findings in the terms an item's own shapes use. */
export function marksOf({ kind, words, marks = [], roles = [], lemmas = [] }) {
  const shape = ruleShape({ kind, words, marks, roles, lemmas });
  const family = kind === "frame" || kind === "place" ? "order" : kind;
  const out = [];
  if (shape.lit.size) out.push({ shape: "lit", words: [...shape.lit].sort((a, b) => a - b) });
  for (const [at, e] of shape.endings) if (e.ending) out.push({ shape: "affix", word: at, chars: [[e.stem.length, e.stem.length + e.ending.length]] });
  for (const [a, b] of shape.pairs) {
    if (family === "order") out.push({ shape: "frame", from: a, to: b });
    else if (family === "article") out.push({ shape: "box", from: a, to: b });
    else if (family === "agreement") out.push({ shape: "link", from: a, to: b });
    else if (family === "ending") {
      const verb = shape.endings.has(b) ? b : a;
      const e = shape.endings.get(verb);
      out.push({ shape: "link", from: verb === b ? a : b, to: verb, ...(e?.ending ? { toChars: [e.stem.length, e.stem.length + e.ending.length] } : {}) });
    }
  }
  if (shape.seats) out.push({ shape: "places", parts: shape.seats, mark: shape.litSeat, place: shape.place });
  return { marks: out, said: shape.said };
}

/**
 * What a list of marks draws, gathered by shape: { lit, pieces, frames, links, affixes, boxes, places, tags, together }. pieces: the
 * words at a frame's or a link's ends that aren't lit (drawn outlined); together: [first, last] word runs that must stay on one line
 * (a box, a link between neighbors).
 */
export function layoutOf(marks = []) {
  const out = { lit: new Set(), pieces: new Set(), frames: [], links: [], affixes: new Map(), boxes: [], places: null, tags: [], together: [] };
  for (const mark of marks) {
    if (mark.shape === "lit") for (const at of mark.words) out.lit.add(at);
    else if (mark.shape === "frame") out.frames.push([mark.from, mark.to]);
    else if (mark.shape === "link") out.links.push(mark);
    else if (mark.shape === "affix") out.affixes.set(mark.word, [...(out.affixes.get(mark.word) ?? []), ...mark.chars]);
    else if (mark.shape === "box") out.boxes.push([mark.from, mark.to]);
    else if (mark.shape === "places") out.places = mark;
    else if (mark.shape === "tag") out.tags.push(mark);
  }
  for (const [a, b] of out.frames) for (const at of [a, b]) if (!out.lit.has(at)) out.pieces.add(at);
  for (const { from, to } of out.links) for (const at of [from, to]) if (!out.lit.has(at)) out.pieces.add(at);
  out.together = [...out.boxes, ...out.links.filter(({ from, to }) => Math.abs(to - from) === 1).map(({ from, to }) => [Math.min(from, to), Math.max(from, to)])];
  return out;
}

/**
 * The lines an item's own marks say: each mark's note, as written; a place's word and where it comes; an affix's word from its dictionary
 * form, when the item has one. Never a line the marks don't give grounds for.
 */
export function saidOfMarks(marks = [], words = [], lemmas = []) {
  const said = [];
  const core = (at) => split(words[at])[0];
  const places = marks.find((mark) => mark.shape === "places");
  if (places?.place) {
    const [a, b] = places.parts[places.mark];
    said.push({ line: "place", parts: { word: range(a, b).map(core).join(" "), place: places.place } });
  }
  for (const mark of marks) {
    if (mark.shape !== "affix" || !lemmas[mark.word] || bare(lemmas[mark.word]) === bare(core(mark.word))) continue;
    said.push({ line: "ending", parts: { dictionary: lemmas[mark.word], word: { text: core(mark.word), spans: mark.chars } } });
  }
  for (const mark of marks) if (mark.note) said.push({ note: mark.note });
  return said;
}
