// Which open books a learner can read: one answer for every place that counts or searches them (Home's book card, Read's search, Find a
// book, the shelves' kinds), so none of them promises a book the learner can't read. Pure (no page, no storage): scripts/test-readable.mjs.

/**
 * Whether a catalog book is for a learner of `lang`: the book in `lang`, with its help or plain (the open library publishes plain books first and
 * their help as it's made: a plain book counted for nobody reached none of the learners it was for), or a layer woven into `lang`.
 */
export const readableFor = (meta, lang) => Boolean(meta) && (meta.lang === lang || Object.entries(meta.layers ?? {}).some(([to, layer]) => layer?.kind === "weave" && to === lang));

/** The catalog's books a learner of `lang` can read, in the catalog's order. */
export const readableBooks = (catalog, lang) => (catalog?.books ?? []).filter((meta) => readableFor(meta, lang));
