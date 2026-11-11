// What a site that doesn't offer the paid plan says nowhere a person or an AI reads it (the public pages, every screen, MCP's tools and
// guides): payments, a plan, prices, Stripe, a trial, receipts, Lexicommons Cloud, the in-app AI or a key of your own for it. gate-check
// holds the public pages to it with the plan off and privacy-check every screen and MCP; with the plan on, the pages must say it (their
// control). Allowed: the terms' cap on liability, which holds with no plan and names none, and the session tally's look (a strip of paper
// torn off like a till receipt: the design system's words, in the theming guide), which is no payment.
export const PLAN_WORDS =
  /\b(payments?|pay|paid|paying|pricing|prices?|stripe|subscriptions?|subscribe|trials?|refunds?|refunded|receipts?|billing|checkout|lexicommons cloud|included ai|in-app ai|the plan|your plan|a plan|openrouter|a key of your own)\b|\$\s?\d/gi;
const ALLOWED = ["what you paid us in the 12 months before the claim", "on a till receipt"];

/** The words of a page as a reader gets them: no tags, scripts or styles, entities read, spaces folded. */
export function readable(html) {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|’/g, "’")
    .replace(/\s+/g, " ");
}

/** Each place the words say what isn't offered: [{ word, around }] (none for a clean text). */
export function planWordsIn(text) {
  let words = text.replace(/\s+/g, " ");
  for (const allowed of ALLOWED) words = words.split(allowed).join(" ");
  return [...words.matchAll(PLAN_WORDS)].map((m) => ({ word: m[0], around: words.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50).trim() }));
}
