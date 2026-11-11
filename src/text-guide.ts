// get_text_guide: how an AI adds a text to the person's reading library well (src/mcp-texts.ts). Built from the limits
// the code enforces (library.ts TEXT_UPLOADS, cover-svg.js COVER_LIMITS), so the guide never promises more than they allow.
// scripts/test-guides.mjs adds the example through the real tools (its chapters as the guide says) and plants every refusal listed.

import { TEXT_UPLOADS } from "./library";
import { COVER_LIMITS } from "../public/js/read/cover-svg.js";
import { shownJson } from "./guide-json";

const mb = (bytes: number) => `${Math.round(bytes / 100_000) / 10} MB`;

/** A short text written for a beginner in Dutch, as plain text: two chapters, each a heading line and its title line. */
export const TEXT_EXAMPLE = {
  filename: "naar-de-markt.txt",
  language: "nl",
  title: "Naar de markt",
  text: `Hoofdstuk 1
Naar de markt

Het is zaterdag. Ik ga naar de markt. Ik koop brood, kaas en appels. De kaas is lekker.

"Hoeveel kost het?" vraag ik. "Vier euro," zegt de man.

Hoofdstuk 2
Thuis

Ik ben thuis. Ik eet een appel. Morgen ga ik weer.
`,
  chapters: ["Naar de markt", "Thuis"],
};

/**
 * A text in a language written without spaces, as a book (format book): its words split as a learner should see them, each with its
 * punctuation attached, and its paragraphs; its sentences, version and id are worked out by the server (text-files.ts).
 */
export const BOOK_EXAMPLE = {
  format: "lexicommons-book",
  v: 1,
  lang: "ja",
  title: "駅へ",
  words: ["駅へ", "私", "は", "駅", "に", "行きます。", "電車", "は", "九時", "に", "来ます。"],
  paras: [
    { k: "h", s: 0, e: 1 },
    { k: "p", s: 1, e: 11 },
  ],
};

/** What add_text says when it refuses, and what to do (test-guides.mjs plants each and finds `says` in the message). */
export const TEXT_REFUSALS: { id: string; says: string; fix: string }[] = [
  { id: "upload-id", says: "upload_id must be the id request_text_upload gave", fix: "Pass upload_id exactly as request_text_upload gave it." },
  { id: "no-upload", says: "No upload … waiting for a text", fix: "Ask for a new link with request_text_upload: each upload goes into one text, and a used or unknown one can't be added." },
  { id: "not-sent", says: "Upload … hasn't arrived yet", fix: "Send the file to its link first (PUT, as its curl command does), then add_text." },
  { id: "empty", says: "There's nothing to read in that text", fix: "The file had no words: send the text itself." },
  { id: "utf8", says: "isn't UTF-8", fix: "Send the text as UTF-8." },
  { id: "json", says: "The book isn't JSON", fix: "A book upload is a lexicommons-book as JSON; for plain text use format text." },
  { id: "book-lang", says: "The book is in …, not …", fix: "language must be the book's own (its lang)." },
  { id: "book-cover", says: "A book carries no cover", fix: "Upload the cover on its own (format cover) and pass cover_upload_id." },
  { id: "epub", says: "That isn't an EPUB", fix: "Send the .epub file exactly as it is, or the text as format text." },
  { id: "cover", says: "The cover can't be used", fix: "Draw the cover as one <svg> with a viewBox and only what A cover (above) lists; the message says what's wrong." },
];

export function textGuide(): string {
  return `# Adding a text to their reading library

Lexicommons' Read tab is where they read texts in the language they're learning, with help on each word they don't
know yet. You can add a text there: a book from their computer, a page from the web, or a text you write for them.
It goes to every device of theirs and stays there: it's theirs alone, never shared.

## The steps
1. get_learner: their language and level, and the words they know (for a text you write). It's empty until their app has opened
   Practice with you: then list_packs says which language they're learning (the language of Lexicommons' own packs on their devices),
   study_summary what they've studied once their app has opened with you connected, and if both are empty, ask them, and write as for a
   beginner.
2. Write the text, or get the file they want (below: what makes a good one).
3. request_text_upload with its format (text, book or epub) and a filename. It gives:
   upload_id (for add_text), upload_url (where the file goes), method (PUT), content_type (send the file with exactly
   this Content-Type), max_bytes, expires (the link works for 15 minutes, once) and curl (the whole command to send it).
4. Send the file: run the curl command with the file's path, or PUT its bytes to upload_url yourself. Never paste a text
   into a tool's arguments.
5. Optionally a cover: request_text_upload with format cover, send the SVG the same way (below).
6. add_text with upload_id, language (the text's own language, as a code the tool lists: nl, de, en…; a text in the language they're
   learning is read with help on each word, one in a language they know can be woven, and one in any other language is only kept), title (else the book's own, or its first words),
   authors (when someone else wrote it; leave it out for a text you wrote) and cover_upload_id. It's checked here (plain
   text is made into a book now; an EPUB on each device) and every problem is said at once. It answers with text_id,
   change_id, the title and word count, and the devices it's on its way to.
7. A few seconds later, get_text with the text_id: where it arrived, or why a device couldn't read it.

A link that's expired or was already used can't be sent to again: ask for a new one. If the PUT fails, ask for a new
link and send it again.

## An example
A text written for a beginner in Dutch, uploaded as format text ("${TEXT_EXAMPLE.filename}"), then
add_text { "upload_id": "<from request_text_upload>", "language": "nl", "title": "${TEXT_EXAMPLE.title}" }:

${TEXT_EXAMPLE.text}
It becomes a book of two chapters, ${TEXT_EXAMPLE.chapters.map((c) => `"${c}"`).join(" and ")}: each heading line ("Hoofdstuk 1") with the short title line under it.

## What makes a good text for them

Read get_learner first. Pick or write for their level:
- A beginner reads best with short sentences, the words they already know, and a few new ones that repeat: a short
  story of a few hundred words, a dialog, a simple account of their day. Picture-book length is right at the start.
- Further on, a page of a novel, a news article, a letter, a recipe: something they'd read anyway, at the edge of what
  they know.
- Writing one yourself, use the words get_learner says they know, bring in a handful of new ones on purpose and use
  each a few times. A title helps them find it again.
- Something from the web or their computer: only what they asked for. If it's long, ask whether they want all of it.

## The formats

- text: plain UTF-8 text, up to ${mb(TEXT_UPLOADS.text!.maxBytes)}, made into a book here:
  - Paragraphs are separated by a blank line. Lines inside a paragraph are joined when they're hard-wrapped (most of
    them 40 to 90 characters); otherwise each line is a paragraph of its own.
  - A chapter starts at a heading line on its own, starting with a capital or a number: "Chapter 3", "CHAPTER III.",
    "Part Two", "Hoofdstuk 2", "Deel 1", "Prologue", "Epilogue", "Introduction", "Voorwoord", or a bare number or Roman
    numeral ("XII", "12."). A short line right under it (10 words at most, not ending like a sentence) is the chapter's
    title. Headings with nothing between them are a table of contents and stay plain text.
  - A line of only * # ~ or dashes is a scene break; _underscored_ words are italic.
  - A Project Gutenberg file's header and license are left out, and its Title and Author used.
  - The book's title: add_text's title, else a Gutenberg Title, else its first words.
- book: a lexicommons-book as JSON (up to ${mb(TEXT_UPLOADS.book!.maxBytes)}), when you already have one. It carries no
  cover: send that on its own. Its lang must be the language you give.
- In Japanese, Chinese, Cantonese or Thai, a book is how you choose where the words split: see below.
- epub: an EPUB file as it is (up to ${mb(TEXT_UPLOADS.epub!.maxBytes)}), say one from their computer. Each device makes it
  into a book; if one can't, get_text says why.

## Japanese, Chinese, Cantonese and Thai
They're written without spaces. Plain text in them (format text) is split into words here by the runtime's own word breaker, which
doesn't always split as a learner should see it (Chinese 我去, "I go", comes as one word). To choose the split yourself, send the
text as a book instead (request_text_upload with format book, the JSON as the file): its words in order, split as a learner should
see them (content words with their endings on, particles on their own, as the pack guide splits a sentence), each with the
punctuation that follows it attached ("行きます。"), and its paragraphs, each { "k": "p" (a paragraph) or "h" (a heading), "s": its
first word's number, "e": one past its last }, covering every word in order. Its sentences, version and id are worked out here:
${shownJson(BOOK_EXAMPLE)}
Then add_text with that upload_id and the language ("ja"). A title in add_text wins over the book's own.

## A cover (optional)

You may draw a cover as SVG and upload it as format cover (up to ${COVER_LIMITS.bytes / 1024} KB), then pass its id as
cover_upload_id. It shows on the Read tab beside the title. Keep it simple: one <svg> with a viewBox (a 2:3 page,
such as 0 0 200 300 looks best), shapes (rect, circle, ellipse, line, polyline, polygon, path), gradients, groups and
text, with fill, stroke, opacity and transform. Everything else is left out (scripts, styles, links, images, fonts from
elsewhere, filters, animation), and a cover with a DOCTYPE, entities, CDATA or <svg> inside it is refused; add_text says
what it left out. Covers stay on their devices: nothing shared ever carries one.

## When it's refused
Nothing is kept. When it's the call that's wrong (the language, the upload id), the upload is still there to add once
it's right; when it's the file, send the fixed file in a new upload. What each one says (… is the part that changes), and what to do:
${TEXT_REFUSALS.map(({ says, fix }) => `- ${says}: ${fix}`).join("\n")}

## After adding

It shows in Read among their texts, on every device of theirs. add_text says which devices it's on its way to; a device
that's closed takes it the next time Lexicommons opens (it waits 7 days). get_text with its text_id says where it
arrived, or why a device couldn't read it. list_texts shows everything in their library. remove_text takes one away
(each device keeps it 7 days), and undo_text_change undoes a text's latest change, here or with Undo in their app.

## Weaving it
A text in a language they know (English) can be woven into the language they learn, at their level: get_weave_guide
says how. The weave starts with them, in Read, on the text (Weave it), and comes to you as a request.
`;
}
