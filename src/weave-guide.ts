// get_weave_guide: how the person's AI weaves a text of theirs into the language they're learning. The rules themselves are the books
// pipeline's (weave-rules.generated.ts, the ones its judges hold every layer to); this is everything around them: where a weave comes from,
// the steps, the form a weave is sent in (the rules' own: add_weave makes it into the stored form, weave-answer.ts), a worked example,
// what's refused and why, the limits, and what the learner sees. scripts/test-guides.mjs runs the example through add_weave, checks the
// lines it says the learner sees against the reader's own render (read/woven-text.js), and plants every refusal listed.

import { LANGUAGES } from "../public/js/lang/index.js";
import { WEAVE_LANGUAGES } from "../public/js/read/weave-languages.generated.js";
import { TEXT_UPLOADS } from "./library";
import { shownJson } from "./guide-json";
import { WEAVE_RULES } from "./weave-rules.generated";

/**
 * The worked example: the start of a paragraph of Alice's Adventures in Wonderland (public domain), as a person would paste it, and its weave
 * into Dutch in the form add_weave takes. The weave is the books pipeline's own, from Lexicommons' woven Alice (CC BY-SA 4.0), whose
 * judges passed it; `shown` is how the reader shows it at three levels.
 */
export const WEAVE_EXAMPLE = {
  language: "nl",
  title: "Down, down, down",
  text: "Down, down, down. Would the fall never come to an end! “I wonder how many miles I’ve fallen by this time?” she said aloud.",
  to_weave: [
    { x: 0, words: ["Down,", "down,", "down."] },
    { x: 1, words: ["Would", "the", "fall", "never", "come", "to", "an", "end!"] },
    { x: 2, words: ["“I", "wonder", "how", "many", "miles", "I’ve", "fallen", "by", "this", "time?”", "she", "said", "aloud."] },
  ],
  weave: {
    sentences: [
      {
        x: 0,
        t: [
          { w: "Down,", target: "Omlaag,", lemma: "omlaag" },
          { w: "down,", target: "omlaag,", lemma: "omlaag" },
          { w: "down.", target: "omlaag.", lemma: "omlaag" },
        ],
        text: "Omlaag, omlaag, omlaag.",
        m: [
          { target: "Omlaag,", cue: "Down", sources: [0], lemma: "omlaag" },
          { target: "omlaag,", cue: "down", sources: [1], lemma: "omlaag" },
          { target: "omlaag.", cue: "down", sources: [2], lemma: "omlaag" },
        ],
        u: [],
        c: [],
      },
      {
        x: 1,
        t: [
          { w: "Would", target: "Zou", lemma: "zullen" },
          { w: "the", target: "de", lemma: "de" },
          { w: "fall", target: "val", lemma: "val" },
          { w: "never", target: "nooit", lemma: "nooit" },
          { w: "come", target: "komen", lemma: "komen" },
          { w: "to", target: "tot", lemma: "tot" },
          { w: "an", target: "een", lemma: "een" },
          { w: "end!", target: "einde!", lemma: "einde" },
        ],
        text: "Zou de val nooit tot een einde komen!",
        m: [
          { target: "Zou", cue: "Would", sources: [0], lemma: "zullen" },
          { target: "de", cue: "the", sources: [1], lemma: "de" },
          { target: "val", cue: "fall", sources: [2], lemma: "val" },
          { target: "nooit", cue: "never", sources: [3], lemma: "nooit" },
          { target: "tot", cue: "to", sources: [5], lemma: "tot" },
          { target: "een", cue: "an", sources: [6], lemma: "een" },
          { target: "einde", cue: "end", sources: [7], lemma: "einde" },
          { target: "komen!", cue: "come", sources: [4], lemma: "komen" },
        ],
        u: [],
        c: ["modal", "question"],
      },
      {
        x: 2,
        t: [
          { w: "“I", target: "“Ik", lemma: "ik" },
          { w: "wonder", target: "vraag me af", lemma: "afvragen" },
          { w: "how", target: "hoe", lemma: "hoe" },
          { w: "many", target: "veel", lemma: "veel" },
          { w: "miles", target: "mijl", lemma: "mijl" },
          { w: "I’ve", target: "ik ben", lemma: "zijn" },
          { w: "fallen", target: "gevallen", lemma: "vallen" },
          { w: "by", target: "tegen", lemma: "tegen" },
          { w: "this", target: "deze", lemma: "deze" },
          { w: "time?”", target: "tijd?”", lemma: "tijd" },
          { w: "she", target: "ze", lemma: "zij" },
          { w: "said", target: "zei", lemma: "zeggen" },
          { w: "aloud.", target: "hardop.", lemma: "hardop" },
        ],
        text: "“Ik vraag me af hoeveel mijl ik inmiddels gevallen ben?” zei ze hardop.",
        m: [
          { target: "“Ik", cue: "I", sources: [0], lemma: "ik" },
          { target: "vraag", cue: "wonder", sources: [1], lemma: "afvragen" },
          { target: "me", cue: "myself", sources: [1], lemma: "me" },
          { target: "af", cue: "off", sources: [1], lemma: "afvragen" },
          { target: "hoeveel", cue: "how many", sources: [2, 3], lemma: "hoeveel" },
          { target: "mijl", cue: "miles", sources: [4], lemma: "mijl" },
          { target: "ik", cue: "I", sources: [5], lemma: "ik" },
          { target: "inmiddels", cue: "by this time", sources: [7, 8, 9], lemma: "inmiddels" },
          { target: "gevallen", cue: "fallen", sources: [6], lemma: "vallen" },
          { target: "ben?”", cue: "am", sources: [5], lemma: "zijn" },
          { target: "zei", cue: "said", sources: [11], lemma: "zeggen" },
          { target: "ze", cue: "she", sources: [10], lemma: "zij" },
          { target: "hardop.", cue: "aloud", sources: [12], lemma: "hardop" },
        ],
        u: [
          { k: 2, len: 2, target: "hoeveel" },
          { k: 7, len: 3, target: "inmiddels?”" },
        ],
        c: ["v2", "perfect", "separable"],
      },
    ],
  },
  shown: [
    { knows: ["omlaag", "zullen", "de", "val", "nooit", "komen"], reads: "Omlaag, omlaag, omlaag. Zou de val nooit komen to an end! “I wonder how many miles I’ve fallen by this time?” she said aloud." },
    { knows: ["omlaag", "zullen", "de", "val", "nooit", "komen", "tot", "een", "einde", "ik", "afvragen", "hoe", "veel"], reads: "Omlaag, omlaag, omlaag. Zou de val nooit tot een einde komen! “Ik vraag me af hoeveel miles I’ve fallen by this time?” she said aloud." },
    { knows: "every word", reads: "Omlaag, omlaag, omlaag. Zou de val nooit tot een einde komen! “Ik vraag me af hoeveel mijl ik inmiddels gevallen ben?” zei ze hardop." },
  ],
};

/**
 * Two more sentences, each a text of its own: a verb group with never inside it (the books pipeline's own, from Lexicommons' woven Alice, judged
 * after the rules' groups came in), and a perfect with another adverb inside, which ends the group (written by the rules). test-guides.mjs adds
 * each through add_weave.
 */
export const WEAVE_MORE = [
  {
    title: "Twenty",
    text: "I shall never get to twenty at that rate!",
    note: "A verb group: shall, never and get take the verb's lemma (komen) in t, with one idiom upgrade over the three (zal nooit komen); never joins the group because it's inside the run. In m each Dutch word has its own dictionary form: zal is zullen, nooit is nooit.",
    weave: {
      sentences: [
        {
          x: 0,
          t: [
            { w: "I", target: "Ik", lemma: "ik" },
            { w: "shall", target: "zal", lemma: "komen" },
            { w: "never", target: "nooit", lemma: "komen" },
            { w: "get", target: "komen", lemma: "komen" },
            { w: "to", target: "bij", lemma: "bij" },
            { w: "twenty", target: "twintig", lemma: "twintig" },
            { w: "at", target: "in", lemma: "in" },
            { w: "that", target: "dat", lemma: "dat" },
            { w: "rate!", target: "tempo!", lemma: "tempo" },
          ],
          text: "In dat tempo zal ik nooit bij twintig komen!",
          m: [
            { target: "In", cue: "at", sources: [6], lemma: "in" },
            { target: "dat", cue: "that", sources: [7], lemma: "dat" },
            { target: "tempo", cue: "rate", sources: [8], lemma: "tempo" },
            { target: "zal", cue: "shall", sources: [1], lemma: "zullen" },
            { target: "ik", cue: "I", sources: [0], lemma: "ik" },
            { target: "nooit", cue: "never", sources: [2], lemma: "nooit" },
            { target: "bij", cue: "to", sources: [4], lemma: "bij" },
            { target: "twintig", cue: "twenty", sources: [5], lemma: "twintig" },
            { target: "komen!", cue: "get", sources: [3], lemma: "komen" },
          ],
          u: [{ k: 1, len: 3, target: "zal nooit komen" }],
          c: ["v2", "future", "demonstrative", "modal"],
        },
      ],
    },
  },
  {
    title: "The cake",
    text: "We have already eaten the cake.",
    note: "A perfect with an adverb inside: already stands between have and eaten, so the group ends before it (only not and never join one). have is its own word with its own lemma (hebben), already is al, eaten is gegeten (lemma eten), and there's no idiom upgrade.",
    weave: {
      sentences: [
        {
          x: 0,
          t: [
            { w: "We", target: "We", lemma: "wij" },
            { w: "have", target: "hebben", lemma: "hebben" },
            { w: "already", target: "al", lemma: "al" },
            { w: "eaten", target: "gegeten", lemma: "eten" },
            { w: "the", target: "de", lemma: "de" },
            { w: "cake.", target: "taart.", lemma: "taart" },
          ],
          text: "We hebben de taart al gegeten.",
          m: [
            { target: "We", cue: "We", sources: [0], lemma: "wij" },
            { target: "hebben", cue: "have", sources: [1], lemma: "hebben" },
            { target: "de", cue: "the", sources: [4], lemma: "de" },
            { target: "taart", cue: "cake", sources: [5], lemma: "taart" },
            { target: "al", cue: "already", sources: [2], lemma: "al" },
            { target: "gegeten.", cue: "eaten", sources: [3], lemma: "eten" },
          ],
          u: [],
          c: ["perfect"],
        },
      ],
    },
  },
];

/** What add_weave says when it refuses, and what to do: `says` is part of the message (test-guides.mjs plants each and finds it). */
export const WEAVE_REFUSALS: { id: string; says: string; fix: string }[] = [
  { id: "missing", says: "Every sentence needs its entry", fix: "One entry for every sentence get_text lists, each with its x." },
  { id: "twice", says: "is given twice", fix: "Each sentence once." },
  { id: "x", says: "x must be the sentence's number", fix: "x is the sentence's number from get_text (0 is the first)." },
  { id: "t-count", says: "t must hold one { w, target, lemma } for each of its … words", fix: "One t entry for every word of the sentence, punctuation-only words included, in order." },
  { id: "t-w", says: "t entry … is for \"…\", but word […] is \"…\"", fix: "Each t entry's w is that word exactly as get_text gives it: you've skipped or added a word." },
  { id: "t-shape", says: "must be { w, target, lemma }", fix: "w and target are text; lemma is text or null." },
  { id: "m-shape", says: "must be { target, cue, sources, lemma }", fix: "target and cue are text, sources a list of word numbers, lemma text or null." },
  { id: "punctuation", says: "must keep the word's punctuation", fix: "A target keeps the word's own punctuation around it: “I → “Ik, end! → einde!" },
  { id: "only-punctuation", says: "is only punctuation: it keeps its text exactly", fix: "A word that's only punctuation (a dash) is its own target, with lemma null." },
  { id: "tiling", says: "m's targets, joined by \" \", must be exactly text", fix: "m's targets, joined with single spaces, must be text exactly, every word and mark." },
  { id: "sources", says: "sources must list distinct word indices", fix: "sources are the [k] numbers (from 0) of the words that m entry carries, each once." },
  { id: "lemma", says: "must be a lowercase dictionary form: letters", fix: "A lemma is the lowercase dictionary form, letters only (the infinitive, the singular), or null." },
  { id: "patterns", says: "c must list distinct pattern ids", fix: "c takes ids from patterns (below), each once; leave it empty when none fits." },
  { id: "idiom-lemma", says: "it must cover at least one word with a lemma", fix: "An idiom upgrade covers words with lemmas: it shows once they're all known." },
  { id: "idiom-len", says: "it covers at least two words", fix: "An idiom upgrade covers two words or more (len ≥ 2) inside the sentence." },
  { id: "split-form", says: "a verb's form split from the rest of it", fix: "Gloss the words of one verb form (had … gone) as the rules' groups say: one lemma, the verb's, and an idiom upgrade over them." },
  { id: "pronoun-alone", says: "an object pronoun shown alone", fix: "An object pronoun of a verb (hem, haar, het, ze, me…) goes in its verb's group: the verb's lemma on both, and an idiom upgrade over the run. A possessive (her coat → haar jas) is a word of its own with its own lemma (haar), and is never refused for this." },
  { id: "language", says: "Weaving into … isn't ready yet", fix: "Only the languages listed can be woven into." },
  { id: "gone", says: "That request's text isn't here any more", fix: "The request finished or was canceled (its text goes with it): look at list_requests." },
];

// Where a weave comes from (today: the person's press in Read), and which languages: each its own passage, to change as the app does.
const WHERE_IT_STARTS = `## Where a weave comes from
A weave starts with the person, in Read: on a text of theirs (one they pasted or uploaded, or one you added with add_text) in a language other than the one they learn, the reader offers "Weave it with your AI" at the text's end the first time, and after that in its Contents ("Weave it into Dutch", with a Weave it button). Their press sends you a weave request with the text. So to weave a text of your own: add it with add_text, then ask them to open it in Read and press Weave it with your AI.`;

const languagesNow = () => {
  const names = WEAVE_LANGUAGES.map((code) => LANGUAGES[code as keyof typeof LANGUAGES]?.name ?? code);
  const which = names.length === 1 ? `${names[0]} only, for now: the one language whose` : `${names.join(", ")} for now: the languages whose`;
  return `## Which languages
Weaving goes into ${which} woven books the books pipeline's judges have accepted. More come as theirs are. The rules are written for a text in English, a language they know; the weave is checked the same way whatever the text's language.`;
};

const STEPS = [
  "list_requests (or wait_for_request): a request of kind weave, with its title and language.",
  "take_request with its request_id: it's yours now, and the app shows you're on it. Keep the seat it gives: add_weave needs it, and take_request with it gives the request back to you later.",
  "get_weave_guide with language, the request's (\"nl\"): you're reading it. Read it once for each language you weave into; the rules at its end are the books pipeline's.",
  "get_text with the request_id: its title, language, and to_weave: every sentence's words, numbered as the rules number them ([0] is a sentence's first word).",
  "Weave every sentence by the rules into the form below.",
  `add_weave with the request_id, your seat and the weave. A long text's weave (past about 1 MB) goes up as a file instead: request_text_upload with format weave (${TEXT_UPLOADS.weave!.maxBytes / 1_000_000} MB at most), send it with the curl command it gives, then add_weave with upload_id in place of weave.`,
  "It's checked at once, as the pipeline's judges check a layer: every sentence and word, then the two mixes they count (a verb's form split from the rest of it, an object pronoun shown alone). Every problem comes back at once, nothing is kept: fix them all and send it again with the same seat.",
  "Once it passes, it's on its way to each of their devices and the request is finished: the app's AI section shows it done, a notification comes if they allow them, and in Read the text's Contents says \"Woven into Dutch\". Tell them what to expect: the text reads in English at first, and Dutch comes into it as they learn its words (a sentence they know nearly all of shows in Dutch whole). get_text with the text_id it gives says where it arrived.",
  "If you can't weave it, finish_request with couldnt and why: they see it, and can ask again.",
];

const FORM = `## The weave you send
{ "sentences": [ one entry per sentence of the text ] }, each:
- x: the sentence's number (get_text's to_weave).
- t: one { "w", "target", "lemma" } for each word of the sentence, in order. w: the word exactly as get_text gives it. target: how it shows woven into the English sentence, keeping the word's own punctuation ("end!" → "einde!"). lemma: the dictionary form of the language they learn, the word-bank key, or null for a word to learn nothing from (a name, a number, punctuation).
- text: the natural sentence in the language they learn.
- m: the literal line: one { "target", "cue", "sources", "lemma" } for each word of text, in text's order. target: that word of text (joined with single spaces, the targets are text exactly). cue: the English words it carries. sources: their numbers ([k]). lemma: that Dutch word's own dictionary form (zal is zullen), even inside a verb group, where t gives every word of the group the verb's lemma; or null. (A lemma's curly apostrophe is made straight here: zo’n is zo'n.)
- u: idiom upgrades, { "k", "len", "target" }: the run of len words from [k] shown as target once every word in it with a lemma is known. Its target keeps the punctuation at the run's edges, as a t target does ("by this time?”" → "inmiddels?”"). Often none.
- c: the ids of the patterns this sentence shows (the rules' list, at the end). Often none.
The rules below say how to choose each one. Nothing else goes in: where each sentence sits in the text and its hash are worked out here.`;

// The reader's default share of a sentence's words known before it shows whole in the language (read/woven-text.js FLIP_AT; the test holds
// them equal; 95 until 10 Nov 2026). Kept here so the Worker doesn't load the reader's module for one number.
export const FLIP_AT = 90;

const SEES = `## What they see
- The text in Read, its Contents saying "Woven into Dutch", and woven: the words they know show in the language they learn, in the English sentence, as they learn them; once they know ${FLIP_AT}% of a sentence's words (the reader's default; a setting there changes it), the whole sentence shows in natural {language}: its text.
- A weave isn't undone: it stays with the text on their devices.`;

const block = (value: unknown) => shownJson(value);

/** The rules' own pattern list (their c line's), and how one line of it reads. */
const C_HEAD = "\nc: the ids of the patterns from this list that this sentence's text shows (often none):\n";

/**
 * The rules with their pattern list as the language's grammar is now (patterns: id → { name, about }): one list, never revision 1's beside a
 * newer one. Rules of another shape keep theirs, with the grammar's after them.
 */
function rulesWith(rules: string, patterns: Record<string, { name: string; about?: string }>) {
  const lines = Object.entries(patterns).map(([id, p]) => `  ${id}: ${p.name}.${p.about ? ` ${p.about}` : ""}`);
  const at = rules.indexOf(C_HEAD);
  if (at < 0) return `${rules}\n\nc takes these pattern ids, the language's grammar as it is now:\n${lines.join("\n")}`;
  const rest = rules.slice(at + C_HEAD.length).split("\n");
  let n = 0;
  while (n < rest.length && rest[n]!.startsWith("  ")) n++;
  return `${rules.slice(0, at + C_HEAD.length)}${lines.join("\n")}${n < rest.length ? `\n${rest.slice(n).join("\n")}` : ""}`;
}

export function weaveGuide(language: string, patterns: Record<string, { name: string; about?: string }>) {
  const rules = WEAVE_RULES[language]!;
  const name = LANGUAGES[language as keyof typeof LANGUAGES]?.name ?? language;
  const example = WEAVE_EXAMPLE;
  const guide = [
    `# Weaving a text into ${name}`,
    `A weave puts ${name} into a text of theirs at their level: the words they've learned show in ${name} in the English sentence, and a sentence they know nearly all of shows in ${name} whole. You write the weave, sentence by sentence, by the rules the books pipeline holds its own woven books to; it's checked here before it reaches them.`,
    WHERE_IT_STARTS.replaceAll("Dutch", name),
    languagesNow(),
    `## The steps\n${STEPS.map((step, i) => `${i + 1}. ${step}`).join("\n")}`,
    FORM,
    `## A worked example\nThe start of a paragraph of Alice's Adventures in Wonderland, pasted by the person. get_text gives its sentences as:\n${block(example.to_weave)}\nIts weave into Dutch, as add_weave takes it (Lexicommons' own woven Alice, which the pipeline's judges passed):\n${block(example.weave)}\nWhat they read:\n${example.shown.map((level) => `- Knowing ${Array.isArray(level.knows) ? level.knows.join(", ") : level.knows}: ${level.reads}`).join("\n")}\nNote what the rules ask for: "wonder" is the separable "vraag me af" (one lemma, afvragen, for all three words in m, and "me" its own), "how many" is one word of text (hoeveel, sources [2, 3]) with an idiom upgrade over the two, "by this time" is "inmiddels", and sentence 1 is tagged question: Carroll's "!" closes a question in form, verb first.`,
    `## Two more sentences\nEach a text of its own, woven the same way:\n${WEAVE_MORE.map((one) => `### ${one.text}\n${one.note}\n${block(one.weave)}`).join("\n\n")}`,
    `## When it's refused\nEach problem says which sentence and word. What each one says (… is the part that changes), and what to do:\n${WEAVE_REFUSALS.map(({ says, fix }) => `- ${says}: ${fix}`).join("\n")}`,
    `## Limits\n- A weave inline in add_weave up to about 1 MB; past that, upload it (format weave, ${TEXT_UPLOADS.weave!.maxBytes / 1_000_000} MB).\n- The text itself came from the app (${TEXT_UPLOADS.book!.maxBytes / 1_000_000} MB at most as a book): every sentence of it is woven, none left out.`,
    SEES.replace("{language}", name),
    `## The rules\nThe books pipeline's, as of ${rules.asOf}: the same ones its judges hold its own woven books to. Their list of patterns (c) is the language's grammar as it is now.\n\n${rulesWith(rules.rules, patterns)}`,
  ].join("\n\n");
  // One text: the guide with the rules in it (a client that shows only the text a tool sends shows all of it).
  return { language, rules_as_of: rules.asOf, guide };
}
