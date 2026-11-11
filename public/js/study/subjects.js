// A sentence's subject said or left out, where the language leaves it to the verb (lang/subjects.js): the other ways of writing a
// sentence a typed or spoken answer from its English is right in (Type it from English, Say it from English; dictation and Repeat after
// stay word for word, since what's heard is the very sentence), and a match on one of them put back onto the sentence as written. Pure,
// so Node's tests read it (scripts/test-subjects.mjs).
// From the English, another sentence of the learner's with the same English is right too, typed or said exactly (sameEnglishVariants),
// and so is the same sentence for the other gender, where its pack gives it (genderVariants: Obrigada for Obrigado).
//
// Only at a clause's start: the sentence's, or after a leading word or two set off by a comma (Sí, tomo café · No, grazie, bevo acqua),
// before the verb or the negation it waits behind. A pronoun after y, e, pero or ma, or after anche (anche io), stays as written: it's
// there to contrast or to be said; and a sentence that already says its subject anywhere (Vieni anche tu? · Pago io) is never given it again. A pronoun is the verb's own person only when the language's own sentences put that pronoun before that
// form of a verb, and it agrees with the English's subject (I, you, he, she, we): so Lui bevo is never right, and Italian's polite Lei
// (its English "you") is never dropped as lei, "she".
import { SUBJECTS } from "../lang/subjects.js";

const bare = (word) =>
  String(word ?? "")
    .normalize("NFC")
    .replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, "")
    .toLocaleLowerCase();
// A verb, by the dictionary form a pack files it under: Spanish, Portuguese and Italian infinitives end in -r or -re (tomar, pôr, bere).
const isVerb = (lemma) => typeof lemma === "string" && /r(?:e)?$/u.test(lemma.normalize("NFC").toLocaleLowerCase());
const upperFirst = (text) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const lowerFirst = (text) => text.charAt(0).toLocaleLowerCase() + text.slice(1);

/** The English's subject: its first I, you, he, she or we (I'm, you're, we'll too), or null. */
export function englishSubject(means) {
  const found = /(?:^|[^\p{L}'])(I|[Yy]ou|[Hh]e|[Ss]he|[Ww]e)(?=$|[^\p{L}])/u.exec(String(means ?? ""));
  return found ? (found[1] === "I" ? "I" : found[1].toLowerCase()) : null;
}

// Which pronouns each verb form follows in a language's sentences: form -> Set of pronouns. Kept per items array, worked out once.
const PERSONS = new WeakMap();
function personsOf(lang, items) {
  const table = SUBJECTS[lang];
  if (!table || !Array.isArray(items)) return new Map();
  let byLang = PERSONS.get(items);
  if (!byLang) PERSONS.set(items, (byLang = new Map()));
  if (byLang.has(lang)) return byLang.get(lang);
  const persons = new Map();
  for (const item of items) {
    const words = item?.words;
    if (!Array.isArray(words)) continue;
    for (let i = 0; i < words.length; i++) {
      const pronoun = bare(words[i]?.[0]);
      if (!(pronoun in table.pronouns)) continue;
      let j = i + 1;
      while (j < words.length && table.negation.includes(bare(words[j]?.[0]))) j++;
      if (j >= words.length || !isVerb(words[j]?.[1])) continue;
      const form = bare(words[j][0]);
      if (!persons.has(form)) persons.set(form, new Set());
      persons.get(form).add(pronoun);
    }
  }
  byLang.set(lang, persons);
  return persons;
}

// A verb form's person by the language's own table: an irregular form as written, else the first ending that fits.
function endingPersons(table, form) {
  if (table.forms?.[form]) return table.forms[form];
  return (table.endings ?? []).find(([ending]) => ending.test(form))?.[1] ?? [];
}

/**
 * The other right ways of writing an item from its English, as the language allows: [{ text, kind: "drop" | "add", at, pronoun }], text
 * with the item's end mark; at: the word's place in the sentence as written (drop: the pronoun's; add: where it goes, before the clause's
 * first word). lang: the item's language; items: that language's sentences (where each verb form's person is read); means: the English.
 */
export function subjectVariants(item, { lang, items = [], means = item?.means } = {}) {
  const table = SUBJECTS[lang];
  const words = Array.isArray(item?.words) ? item.words : [];
  if (!table || words.length < 2) return [];
  const subject = englishSubject(means);
  if (!subject) return [];
  const texts = words.map(([text]) => String(text));
  const punct = item.punct ?? "";
  const join = (list) => list.join(" ") + punct;
  // The clause's start: past a leading word or two set off by a comma (Sí, · No, grazie,), never the sentence's last word.
  let at = 0;
  while (at < 2 && at < texts.length - 1 && /,$/.test(texts[at])) at++;
  // Its opening marks (Spanish's ¿ ¡) stay at the front of whatever begins it.
  const lead = texts[at].match(/^[¿¡]*/u)[0];
  const atStart = at === 0;
  // The sentence with word k taken out, or with a pronoun put in before word k: the clause's first word keeps its opening marks, and
  // the sentence's first its capital.
  const without = (k) => {
    const rest = [...texts];
    rest.splice(k, 1);
    if (k === at && k < rest.length) rest[k] = lead + (atStart ? upperFirst(rest[k]) : rest[k]);
    return rest;
  };
  const withOne = (k, one) => {
    const rest = [...texts];
    if (k === at) {
      rest[k] = atStart ? lowerFirst(rest[k].slice(lead.length)) : rest[k].slice(lead.length);
      rest.splice(k, 0, lead + (atStart ? upperFirst(one) : one));
    } else rest.splice(k, 0, one);
    return rest;
  };
  const is = (k, list) => k < texts.length && (list ?? []).includes(bare(texts[k]));
  // A word that opens the clause (entonces, allora, então): the subject may come after it or before it.
  let i = at;
  const opener = is(i, table.openers) && i + 1 < texts.length ? i : -1;
  if (opener >= 0) i++;
  const pronounAt = bare(texts[i]) in table.pronouns ? i : -1;
  // Then an adverb the subject goes before (también, todavía; também, ainda), then a negation, then the verb.
  let verb = pronounAt >= 0 ? i + 1 : i;
  if (is(verb, table.before)) verb++;
  while (verb < words.length && table.negation.includes(bare(texts[verb]))) verb++;
  if (verb >= words.length || !isVerb(words[verb][1])) return [];
  if (pronounAt >= 0) {
    // Said: left out, when it's the English's subject.
    const pronoun = bare(texts[pronounAt]);
    if (table.pronouns[pronoun] !== subject) return [];
    return [{ text: join(without(pronounAt)), kind: "drop", at: pronounAt, pronoun }];
  }
  // Never a pronoun the sentence already says for that person anywhere: after anche, también or também, after its verb, in a short
  // answer, or run into another word (Vieni anche tu? · Pago io · ¿Vienes tú también? · Vem você também? · Vengo anch'io): said twice, it's wrong.
  if (texts.some((text) => bare(text).split(/['’]/u).some((part) => table.pronouns[part] === subject))) return [];
  // Left out: said, by each pronoun that's the verb form's person (the language's sentences, its endings) and the English's subject:
  // where the clause starts (after an opener, or before it).
  const form = bare(texts[verb]);
  const persons = new Set([...(personsOf(lang, items).get(form) ?? []), ...endingPersons(table, form)]);
  return [...persons]
    .filter((one) => table.pronouns[one] === subject)
    .flatMap((one) => [i, ...(opener >= 0 ? [opener] : [])].map((k) => ({ text: join(withOne(k, one)), kind: "add", at: k, pronoun: one })));
}

// The learner's sentences by their English, as written (case, spacing and marks aside): kept per items array, worked out once.
const plainEnglish = (text) => String(text ?? "").normalize("NFC").toLocaleLowerCase().replace(/[\p{P}\s]+/gu, " ").trim();
const BY_ENGLISH = new WeakMap();

/**
 * Another sentence the learner has with the same English (path-nl's "Doet je mond pijn?" and "Doet uw mond pijn?", both "Does your mouth
 * hurt?"): both are right translations of it, so from the English either is right, typed exactly. [{ text, kind: "sibling", other }]: text
 * as textOf writes a sentence (content.js sentence), never the item's own words again. items: the learner's sentences in its language.
 */
export function sameEnglishVariants(item, { items = [], textOf } = {}) {
  const english = plainEnglish(item?.means);
  if (!english || !Array.isArray(items) || typeof textOf !== "function") return [];
  let byEnglish = BY_ENGLISH.get(items);
  if (!byEnglish) {
    byEnglish = new Map();
    for (const one of items) {
      const key = plainEnglish(one?.means);
      if (!key) continue;
      if (!byEnglish.has(key)) byEnglish.set(key, []);
      byEnglish.get(key).push(one);
    }
    BY_ENGLISH.set(items, byEnglish);
  }
  const own = plainEnglish(textOf(item));
  const seen = new Set([own]);
  const out = [];
  for (const other of byEnglish.get(english) ?? []) {
    const text = textOf(other);
    if (seen.has(plainEnglish(text))) continue;
    seen.add(plainEnglish(text));
    out.push({ text, kind: "sibling", other });
  }
  return out;
}

/**
 * The same sentence for the other gender, from its pack (otherGender: Obrigada beside Obrigado, ¿Estás lista? beside ¿Estás listo?): from
 * the English it's right too, typed or said exactly, since the English doesn't say who's speaking or who's spoken to.
 * [{ text, kind: "gender", gender, who }] or [].
 */
export function genderVariants(item) {
  const other = item?.otherGender;
  if (!other || typeof other.text !== "string" || !other.text.trim()) return [];
  return [{ text: other.text, kind: "gender", gender: other.gender, who: other.who }];
}

/**
 * A match that's right on one of the variants put back onto the sentence as written (wordOutcomes and the said line read a result word by
 * word, in the sentence's order): a pronoun left out shown where it goes, right and marked optional (it's no evidence it was known); a
 * pronoun added taken out. A result on the sentence itself as it is. A variant's result that isn't right is null: grade that answer
 * against the sentence as written instead (a slip in the pronoun is a slip, and never goes with it).
 */
export function asWritten(result, variants, item) {
  const used = result && variants?.find((one) => result.expected === one.text);
  if (!used || !Array.isArray(result.words)) return result;
  if (!result.ok || !result.words.every((word) => word.result === "right" || word.result === "close") || result.extra?.length) return null;
  const shown = (i) => String(item.words[i]?.[0] ?? "").replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, "");
  if (used.kind === "gender") {
    // The sentence for the other gender, typed or said exactly: shown as the learner gave it (Obrigada, right), never put back onto the
    // sentence's own words; and every word of the sentence known, since it's the same words in the other gender's form (evidence: what
    // attribute.js wordOutcomes reads for it, the words not lining up one for one: un insegnante, un'insegnante).
    const evidence = Object.fromEntries((item.words ?? []).filter(([, lemma]) => lemma).map(([, lemma]) => [lemma, "right"]));
    return { ...result, expected: used.text, variant: used.kind, gender: used.gender, who: used.who, evidence };
  }
  if (used.kind === "sibling") {
    // Another sentence with the same English, typed or said exactly: the sentence as written, every word right, and a word of it the other
    // sentence hasn't got (je beside uw) marked optional: shown, but no evidence it was known.
    const has = new Set((used.other.words ?? []).flatMap(([text, lemma]) => [bare(text), lemma && String(lemma).toLocaleLowerCase()]).filter(Boolean));
    const words = item.words.map(([text, lemma], i) => ({ text: shown(i), heard: null, result: "right", ...(has.has(bare(text)) || (lemma && has.has(String(lemma).toLocaleLowerCase())) ? {} : { optional: true }) }));
    return { ...result, expected: item.words.map(([text]) => text).join(" ") + (item.punct ?? ""), words, variant: used.kind };
  }
  const words =
    used.kind === "drop"
      ? item.words.map((_, i) => (i === used.at ? { text: shown(i), heard: null, result: "right", optional: true } : { ...result.words[i < used.at ? i : i - 1], text: shown(i) }))
      : item.words.map((_, i) => ({ ...result.words[i < used.at ? i : i + 1], text: shown(i) }));
  return { ...result, expected: item.words.map(([text]) => text).join(" ") + (item.punct ?? ""), words, variant: used.kind };
}
