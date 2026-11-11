// Requests for your AI (public/js/ai/requests.js), case by case: what each kind carries and what's refused, how the AI
// finishes one (done with links, couldn't, an answer for a question), and the words the app shows. Pure, so it runs in
// Node: `node scripts/test-requests.mjs` (exit 0 = pass).

import { answerParts, checkFinish, checkRequest, describeAsk, describeRequest, REQUEST_KINDS, REQUEST_LIMITS } from "../public/js/ai/requests.js";
import { WEAVE_LANGUAGES } from "../public/js/read/weave-languages.generated.js";
import { LANGUAGES } from "../public/js/lang/index.js";

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const eq = (actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${a} ≠ ${e}`);
};
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const refuses = (fn, pattern) => {
  try {
    fn();
  } catch (error) {
    if (!pattern.test(error.message)) throw new Error(`refused, but with "${error.message}"`);
    return;
  }
  throw new Error(`not refused (wanted ${pattern})`);
};

test("the kinds, each with its name and what it's for", () => {
  eq(Object.keys(REQUEST_KINDS), ["practice", "pack_add", "pack_new", "text_new", "weave", "look", "ask"]);
  // Asked somewhere other than its own page: only a weave (from the reader).
  eq(Object.entries(REQUEST_KINDS).filter(([, kind]) => kind.from).map(([id, kind]) => [id, kind.from]), [["weave", "read"]]);
  for (const [id, kind] of Object.entries(REQUEST_KINDS)) if (!kind.name || !kind.about || typeof kind.check !== "function") throw new Error(id);
});

test("practice: the practice's own settings, checked as the app's start checks them", () => {
  eq(checkRequest({ kind: "practice", practice: { kind: "story", minutes: 15, language: "nl" } }), { kind: "practice", practice: { kind: "story", answer: "both", minutes: 15, topic: undefined, language: "nl", from: "en" } });
  refuses(() => checkRequest({ kind: "practice", practice: { kind: "karaoke" } }), /kind must be one of/);
  refuses(() => checkRequest({ kind: "practice" }), /Send \{ kind, answer/);
});

test("add to my pack: which pack, what to add, and whether to aim at what's due", () => {
  eq(checkRequest({ kind: "pack_add", pack: "travel", packName: "Travel", what: "  20 sentences   about cooking ", due: true }), { kind: "pack_add", pack: "travel", packName: "Travel", what: "20 sentences about cooking", due: true });
  eq(checkRequest({ kind: "pack_add", pack: "travel", what: "more" }).packName, "travel");
  refuses(() => checkRequest({ kind: "pack_add", pack: "Not An Id", what: "x" }), /pack must be/);
  refuses(() => checkRequest({ kind: "pack_add", pack: "travel" }), /what is missing/);
  refuses(() => checkRequest({ kind: "pack_add", pack: "travel", what: "x".repeat(REQUEST_LIMITS.what + 1) }), /keep it to 600/);
});

test("a new pack, a look, a question: what it's for, in which language, as a new theme or not", () => {
  eq(checkRequest({ kind: "pack_new", what: "A trip to Berlin in May", language: "de" }), { kind: "pack_new", what: "A trip to Berlin in May", language: "de" });
  refuses(() => checkRequest({ kind: "pack_new", what: "x", language: "xx" }), /language must be one of/);
  eq(checkRequest({ kind: "look", what: "Like a 70s terminal", fresh: true }), { kind: "look", what: "Like a 70s terminal", fresh: true });
  eq(checkRequest({ kind: "look", what: "Calmer" }).fresh, false);
  eq(checkRequest({ kind: "ask", what: "dat or die?" }), { kind: "ask", what: "dat or die?" });
  refuses(() => checkRequest({ kind: "ask", what: "   " }), /what is empty/);
  refuses(() => checkRequest({ kind: "sing" }), /kind must be one of/);
  refuses(() => checkRequest(null), /must be \{ kind/);
});

test("finishing: done with what it did and links, couldn't with why, an answer only for a question", () => {
  eq(checkFinish({ done: { said: "Added 20 sentences", links: { pack: "travel", changes: ["chg_abcdef12"] } } }, "pack_add"), { state: "done", said: "Added 20 sentences", links: { pack: "travel", changes: ["chg_abcdef12"] } });
  eq(checkFinish({ done: { said: "New theme" } }, "look"), { state: "done", said: "New theme" });
  eq(checkFinish({ couldnt: "That pack is gone" }, "pack_add"), { state: "couldnt", why: "That pack is gone" });
  eq(checkFinish({ answer: "Dat for het-words." }, "ask"), { state: "done", answer: "Dat for het-words." });
  refuses(() => checkFinish({ answer: "x" }, "look"), /answer is for a question/);
  refuses(() => checkFinish({ done: { said: "x" }, couldnt: "y" }, "look"), /exactly one/);
  refuses(() => checkFinish({}, "look"), /exactly one/);
  refuses(() => checkFinish({ done: { said: "x", links: { changes: ["nope"] } } }, "pack_add"), /change ids/);
  refuses(() => checkFinish({ done: { said: "x", links: { theme: "a b" } } }, "look"), /links.theme/);
  refuses(() => checkFinish({ done: {} }, "look"), /done.said is missing/);
});

test("a text: what to add and in which language; finished with a link to the text", () => {
  eq(checkRequest({ kind: "text_new", what: "A short story about the market", language: "nl" }), { kind: "text_new", what: "A short story about the market", language: "nl" });
  refuses(() => checkRequest({ kind: "text_new", what: "x", language: "xx" }), /language must be one of/);
  refuses(() => checkRequest({ kind: "text_new", language: "nl" }), /what is missing/);
  eq(checkFinish({ done: { said: "Added a story", links: { text: "ai-0123456789abcdef" } } }, "text_new"), { state: "done", said: "Added a story", links: { text: "ai-0123456789abcdef" } });
  refuses(() => checkFinish({ done: { said: "x", links: { text: "../etc" } } }, "text_new"), /links.text must be its id/);
});

test("a weave: which text of yours, its title, the language to weave in and the upload carrying it; finished with a link to the text", () => {
  eq(checkRequest({ kind: "weave", book: "paste-0123abcd", title: "  Alice in   Wonderland ", language: "nl", upload: "upl_0123456789ab" }), {
    kind: "weave",
    book: "paste-0123abcd",
    title: "Alice in Wonderland",
    language: "nl",
    upload: "upl_0123456789ab",
    what: "“Alice in Wonderland” into Dutch",
  });
  refuses(() => checkRequest({ kind: "weave", book: "../etc", title: "x", language: "nl", upload: "upl_0123456789ab" }), /book must be the id/);
  refuses(() => checkRequest({ kind: "weave", book: "paste-0123abcd", title: "x", language: "xx", upload: "upl_0123456789ab" }), /language must be one of/);
  // A language of the app's that weaves aren't ready for yet (weave-languages.generated.js has Dutch alone as this is written).
  const notYet = Object.keys(LANGUAGES).find((code) => !WEAVE_LANGUAGES.includes(code));
  refuses(() => checkRequest({ kind: "weave", book: "paste-0123abcd", title: "x", language: notYet, upload: "upl_0123456789ab" }), /isn't ready yet/);
  refuses(() => checkRequest({ kind: "weave", book: "paste-0123abcd", title: "x", language: "nl" }), /upload must be the id/);
  refuses(() => checkRequest({ kind: "weave", book: "paste-0123abcd", title: "x", language: "nl", upload: "a/b" }), /upload must be the id/);
  refuses(() => checkRequest({ kind: "weave", book: "paste-0123abcd", language: "nl", upload: "upl_0123456789ab" }), /title is missing/);
  const trap = JSON.parse('{"toString": null}');
  refuses(() => checkRequest({ kind: "weave", book: trap, title: "x", language: "nl", upload: "upl_0123456789ab" }), /book must be/);
  refuses(() => checkRequest({ kind: "weave", book: "paste-0123abcd", title: "x", language: "nl", upload: trap }), /upload must be/);
  eq(describeRequest({ kind: "weave", what: "“Alice” into Dutch" }), "Weave a text: “Alice” into Dutch");
  eq(checkFinish({ done: { said: "Wove it into Dutch", links: { text: "paste-0123abcd" } } }, "weave"), { state: "done", said: "Wove it into Dutch", links: { text: "paste-0123abcd" } });
});

test("a request in words, for the app's list", () => {
  eq(describeRequest({ kind: "pack_add", packName: "Travel", what: "cooking" }), "Add to my pack: Travel · cooking");
  eq(describeRequest({ kind: "practice", practice: { kind: "story" } }), "Practice with me: Story");
  eq(describeRequest({ kind: "look", what: "Calmer" }), "Change my look: Calmer");
});

test("a field of the wrong type is refused, never coerced (JSON can carry an object whose toString is null)", () => {
  const trap = JSON.parse('{"toString": null}');
  refuses(() => checkRequest({ kind: trap }), /kind must be one of/);
  refuses(() => checkRequest({ kind: "pack_add", pack: trap, what: "x" }), /pack must be/);
  refuses(() => checkRequest({ kind: "pack_new", language: trap, what: "x" }), /language must be/);
  refuses(() => checkRequest({ kind: "practice", practice: { kind: trap } }), /practice must be/);
  refuses(() => checkRequest({ kind: "practice", practice: { kind: "conversation", minutes: trap } }), /practice must be/);
  refuses(() => checkRequest({ kind: "look", what: trap }), /what must be text/);
  refuses(() => checkFinish({ done: { said: "x", links: { pack: trap } } }, "pack_new"), /links.pack/);
  refuses(() => checkFinish({ done: { said: "x", links: { changes: [trap] } } }, "pack_new"), /links.changes/);
  refuses(() => checkFinish({ done: { said: "x", links: { theme: trap } } }, "look"), /links.theme/);
  refuses(() => checkFinish({ couldnt: trap }, "look"), /couldnt must be text/);
});

test("a question carries what it's about: the sentence and your answer, a word, a concept, a book, a Translate search", () => {
  const about = {
    language: "nl",
    where: "study",
    sentence: { id: "boek-gelezen", text: "Ik heb gisteren een boek gelezen.", literal: "I have yesterday a book read.", natural: "I read a book yesterday." },
    game: "arrange",
    answer: "Ik heb een boek gisteren gelezen.",
    right: false,
    word: { text: "gelezen", lemma: "lezen" },
    unit: "p:v2",
    stray: "left out",
  };
  const asked = checkRequest({ kind: "ask", what: "Why does gisteren go there?", about });
  eq(asked.about.unit, { id: "p:v2", kind: "pattern", name: LANGUAGES.nl.patterns.v2.name });
  eq(Object.keys(asked.about), ["language", "where", "sentence", "word", "game", "answer", "right", "unit"]);
  eq(checkRequest({ kind: "ask", what: "?", about: { language: "nl", unit: "w:lezen" } }).about.unit, { id: "w:lezen", kind: "word" });
  eq(checkRequest({ kind: "ask", what: "?", about: { language: "nl", where: "reader", book: { id: "de-rode-regenjas", title: "De rode regenjas", at: 12 } } }).about.book, { id: "de-rode-regenjas", title: "De rode regenjas", at: 12 });
  eq(checkRequest({ kind: "ask", what: "?", about: { language: "nl", translate: { query: "fiets", from: "nl", to: "en" } } }).about.translate, { query: "fiets", from: "nl", to: "en" });
  eq(checkRequest({ kind: "ask", what: "Plain" }), { kind: "ask", what: "Plain" });
  refuses(() => checkRequest({ kind: "ask", what: "?", about: { where: "study" } }), /about.language/);
  refuses(() => checkRequest({ kind: "ask", what: "?", about: { language: "nl", unit: "p:made-up" } }), /no pattern "made-up"/);
  refuses(() => checkRequest({ kind: "ask", what: "?", about: { language: "nl", unit: "x:y" } }), /about.unit must be/);
  refuses(() => checkRequest({ kind: "ask", what: "?", about: { language: "nl", right: "yes" } }), /about.right/);
  refuses(() => checkRequest({ kind: "ask", what: "?", about: { language: "nl", book: { id: "Bad Id", title: "x" } } }), /about.book.id/);
  refuses(() => checkRequest({ kind: "ask", what: "?", about: { language: "nl", translate: { query: "x", from: "nl", to: "de" } } }), /about.translate/);
  refuses(() => checkRequest({ kind: "ask", what: "?", about: { language: "nl", sentence: { text: JSON.parse('{"toString": null}') } } }), /about.sentence.text must be text/);
  // A sentence from a pack other than the starter has the view's id, "<pack>/<item>" (pack-format.js buildView).
  eq(checkRequest({ kind: "ask", what: "?", about: { language: "nl", sentence: { id: "travel-check/boek-gelezen", text: "Ik heb een boek gelezen." } } }).about.sentence.id, "travel-check/boek-gelezen");
  for (const id of ["a/b/c", "/boek", "travel/", "../boek", "travel check/boek"]) refuses(() => checkRequest({ kind: "ask", what: "?", about: { language: "nl", sentence: { id, text: "x" } } }), /about.sentence.id/);
  const text = describeAsk({ what: "Why does gisteren go there?", about });
  ok(text.startsWith("I'm learning Dutch with Lexicommons. Why does gisteren go there?"), text);
  ok(text.includes('The sentence: "Ik heb gisteren een boek gelezen." (word for word: "I have yesterday a book read.") (in English: "I read a book yesterday.").'), text);
  ok(text.includes('I answered "Ik heb een boek gisteren gelezen.", which was wrong (arrange).') && text.includes(`The pattern: ${LANGUAGES.nl.patterns.v2.name}.`), text);
  eq(describeAsk({ what: "Hoi?" }), "I'm learning a language with Lexicommons. Hoi?");
});

test("an answer: plain text, the language's words marked [[like this]], a marker left open kept as typed", () => {
  eq(answerParts("[[heb gelezen]] is the perfect: [[Ik heb]] …"), [{ text: "heb gelezen", language: true }, { text: " is the perfect: ", language: false }, { text: "Ik heb", language: true }, { text: " …", language: false }]);
  eq(answerParts("No marks"), [{ text: "No marks", language: false }]);
  eq(answerParts("Open [[marker"), [{ text: "Open [[marker", language: false }]);
  eq(answerParts("<b>not html</b> [[<i>x</i>]]"), [{ text: "<b>not html</b> ", language: false }, { text: "<i>x</i>", language: true }]);
  eq(answerParts(""), []);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
