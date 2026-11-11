// What kind of mistake can count against a language's concepts: a concept about a word's form says nothing when the words are only in the wrong order, one about order says nothing when a word's form is wrong, and
// some are really both (study/attribute.js patternOutcomes). A person's call, by language, held against each concept's own common mistakes. A concept that isn't listed, and any language with no list, counts as about order, which is how every wrong order has always counted.
const FORM = { nl: ["present", "past", "plural", "de-het", "geen", "adjective", "diminutive", "possessive", "demonstrative", "zijn-hebben", "comparative", "er-is", "reflexive", "imperative", "object"] };
const BOTH = { nl: ["perfect", "relative", "omte", "modal", "future", "aan-het"] };
const setsOf = (lists) => new Map(Object.entries(lists).map(([lang, ids]) => [lang, new Set(ids)]));
const forms = setsOf(FORM);
const both = setsOf(BOTH);
/** What a concept of a language is about: "form", "both" or "order". */
export const conceptKind = (lang, id) => (forms.get(lang)?.has(id) ? "form" : both.get(lang)?.has(id) ? "both" : "order");
