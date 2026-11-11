// The numbers the public home page says (index.html), as they stand at a release: here and nowhere else. The page's words are written
// from them by `node scripts/site-facts.mjs`, js/site.js puts them into a shipped locale's words, and scripts/test-site-pages.mjs fails
// while the page says anything else. `node scripts/site-facts.mjs --compare` prints this repo's own counts beside them.
export const SITE_FACTS = {
  // Languages with something to learn: every starter pack, and every language's lessons.
  languages: 75,
  // Each language's lessons (its path), Dutch first.
  lessons: { nl: 200, de: 200, es: 200, fr: 200, it: 200, ja: 200, pt: 200, ru: 200 },
  // A path with at least this many lessons is a full course (the heading's count of them).
  fullCourse: 200,
  // Claude-drawn SVGs: over this many, and about this many of them move when you're right and when you're wrong.
  pictures: 700,
  moving: 170,
};

/**
 * The values the catalog's messages take (js/i18n/en/site.js): the facts, how many paths are full courses (full), and the lessons
 * line's shape. Every path at the same count reads "each"; else Dutch's count and the rest's, one number when they share it ("same"),
 * a range when they don't ("other").
 */
export function siteValues(facts = SITE_FACTS) {
  const { nl: dutch, ...rest } = facts.lessons;
  const counts = Object.values(rest);
  const low = Math.min(...counts);
  const high = Math.max(...counts);
  const shape = low === high && high === dutch ? "each" : low === high ? "same" : "other";
  const full = Object.values(facts.lessons).filter((n) => n >= facts.fullCourse).length;
  return { languages: facts.languages, pictures: facts.pictures, moving: facts.moving, dutch, low, high, others: counts.length, count: counts.length + 1, shape, full };
}
