// Weave your own: Read's lead for a learner whose language can be woven into (weave-languages.generated.js, the one list). What it is, how
// it's done today, and what to expect, all said from here so Read never promises a step the app doesn't have: change the way in, change HOW.
// It's the one place outside the AI section that may name an AI to someone with none connected (scripts/no-ai-check.mjs allows this part,
// whole, and nothing else on Read): the reader's main use needs one, so Read says so, once, calmly, with one link to connect.

import { WEAVE_LANGUAGES } from "./weave-languages.generated.js";

/** Whether texts can be woven into a language now. */
export const canWeaveInto = (lang) => WEAVE_LANGUAGES.includes(lang);

// How a text of yours gets woven: one message to your AI, with the text after it (the weave guide's "Their one message", src/weave-guide.ts:
// the same words, so the app and the guide agree). Your AI adds the text and weaves it; nothing is pressed here.
const message = (language) => `Weave this into ${language} for me in Lexicommons:`;
const LEAD = "Give your AI this, in its own app:";
const AFTER = "Then paste the text after it, or give a link your AI can open, or a file.";
const NEXT = (language) => `Your AI adds it and weaves it. Its card here says “Woven into ${language}” when it's done. A long text goes a chapter at a time.`;
// The other way: add the text yourself, then ask from the text (reader.js's Weave it with your AI).
const BY_HAND = "Or add a text yourself, open it, and press Weave it with your AI.";

/** The row that shows a woven story with it: how its press is named, from the story's own title. */
export const storyLine = (title) => `See how it reads: ${title}, woven`;

/** What weaving is, in two lines, where a language has the woven story but texts of your own can't be woven into it yet. */
export const tryWeaving = (language) => ({
  title: "Try weaving",
  about: `A story with the ${language} words you know woven into it, each in its place. The more you learn, the more of it turns ${language}.`,
});

/**
 * The entry's words for a language (its name) and whether an AI is connected:
 * { title, about, lead, message, after, next, byHand, expect, needs, connect: { label, href } }. message (to copy), after, next and byHand: for
 * someone connected; needs and connect: for someone who isn't.
 */
export function weaveOwn(language, connected) {
  return {
    title: "Weave your own",
    about: `Read what you'd read anyway, an article or a chapter, with ${language} woven in as far as you know it: first the words you've learned, each in its place, then whole sentences. Your own AI does the weaving.`,
    lead: connected ? LEAD : null,
    message: connected ? message(language) : null,
    after: connected ? AFTER : null,
    next: connected ? NEXT(language) : null,
    byHand: connected ? BY_HAND : null,
    // How good and how fast: the weave is your AI's own work, checked here only for its shape, so it can be wrong in places.
    expect: "It's as good as your AI: expect the odd mistake, and tap any word to check it. It isn't quick, and a long text takes a lot of your AI's usage, so start with a page or two.",
    needs: connected ? null : "It needs an AI of your own, connected to Lexicommons.",
    connect: connected ? null : { label: "Connect your AI", href: "#ai" },
  };
}
