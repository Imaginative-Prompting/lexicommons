// A word as the language writes it (public/js/study/written.js): on the real Dutch packs, words Dutch capitalizes everywhere (Engels,
// Nederlands, Parijs, T-shirt) shown so and everyday words as their keys; a sentence's start never counts; one lowercase place mid-sentence
// keeps the key; Dutch's IJ; German's nouns as they are; a script with no case untouched; books kept on the device, vetoing and forgotten.
// Each rule first fails on a plant. Usage: node scripts/test-written.mjs (exit 0 = pass)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// localStorage as a browser has it, so the books' tallies are kept and read back.
const kept = new Map();
globalThis.localStorage = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) };
const W = await import(join(ROOT, "public/js/study/written.js"));
const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? `: ${detail}` : ""}`);
  if (!ok) fails.push(name);
};
const pack = (file) => JSON.parse(readFileSync(join(ROOT, "packs", file), "utf8"));
const tallyOf = (lang, sentences) => {
  const t = W.writingTally(lang);
  for (const words of sentences) t.add(words);
  return t.done();
};
const formsOf = (lang, sentences) => W.writtenForms([tallyOf(lang, sentences)], lang);

// 1. The real Dutch packs.
const dutch = ["path-nl.json", "words-nl-01.json", "words-nl-02.json"].flatMap((f) => pack(f).items.filter((item) => Array.isArray(item.words)).map((item) => item.words));
const nl = formsOf("nl", dutch);
const want = { engels: "Engels", nederlands: "Nederlands", parijs: "Parijs", "t-shirt": "T-shirt", amerikaans: "Amerikaans", duits: "Duits", frans: "Frans" };
const wrong = Object.entries(want).filter(([lemma, form]) => nl.get(lemma) !== form);
check("Dutch packs: words Dutch always capitalizes shown so", !wrong.length, JSON.stringify(wrong.map(([l]) => [l, nl.get(l)])));
const everyday = ["huis", "ik", "hebben", "koffie", "mooi", "de"].filter((lemma) => nl.has(lemma));
check("Dutch packs: everyday words stay their keys", !everyday.length, everyday.join(", "));
check(`Dutch packs: ${nl.size} words shown capitalized, a handful`, nl.size > 5 && nl.size < 80, String(nl.size));

// 2. A sentence's start never counts, nor a word after a sentence's end inside one item; a plant that counts starts must fail.
const starts = formsOf("nl", [[["Engels", "engels"], ["is", "zijn"], ["moeilijk.", "moeilijk"]], [["Ja.", "ja"], ["Engels", "engels"], ["dus.", "dus"]]]);
check("a sentence's start isn't a place mid-sentence (and after a full stop inside one)", !starts.has("engels"), JSON.stringify([...starts]));
const mid = formsOf("nl", [[["Hij", "hij"], ["spreekt", "spreken"], ["Engels.", "engels"]]]);
check("…while mid-sentence it is", mid.get("engels") === "Engels", JSON.stringify([...mid]));
const quoted = formsOf("nl", [[["Hij", "hij"], ["zegt:", "zeggen"], ["„Engels!”", "engels"], ["Goed", "goed"]]]);
check("quotes around a word: its letters decide; a word after a closing ! starts a sentence", quoted.get("engels") === "Engels" && !quoted.has("goed"), JSON.stringify([...quoted]));

// 3. One lowercase place keeps the key; the control without it is capitalized.
const mixed = [[["Hij", "hij"], ["bidt", "bidden"], ["tot", "tot"], ["God.", "god"]], [["Er", "er"], ["is", "zijn"], ["een", "een"], ["god", "god"], ["van", "van"], ["de", "de"], ["zee.", "zee"]]];
check("one lowercase place mid-sentence keeps the key", !formsOf("nl", mixed).has("god"));
check("…and without it, capitalized (the control)", formsOf("nl", [mixed[0]]).get("god") === "God");

// 3b. A word in capitals throughout says nothing (a sign, a shout); a woven book's capitals don't count, its lowercase places veto.
const shout = [[["Hij", "hij"], ["roept:", "roepen"], ["WAAROM", "waarom"], ["dan?", "dan"]]];
check("a word in capitals throughout doesn't count (WAAROM on a sign)", !formsOf("nl", shout).has("waarom"));
check("…while one capital does (the control)", formsOf("nl", [[["Hij", "hij"], ["roept", "roepen"], ["Waarom", "waarom"]]]).get("waarom") === "Waarom");
const wovenTally = (sentences) => {
  const t = W.writingTally("nl", { vetoOnly: true });
  for (const words of sentences) t.add(words);
  return t.done();
};
const rabbit = wovenTally([[["the", null], ["Wit", "wit"], ["Rabbit", null]]]);
check("a woven book's capitalized word counts for nothing (the White Rabbit's Wit)", !W.writtenForms([rabbit], "nl").has("wit"));
const wovenLower = wovenTally([[["a", null], ["wit", "wit"], ["cat", null]]]);
const packWit = tallyOf("nl", [[["Het", "het"], ["Wit", "wit"], ["Huis.", "huis"]]]);
check("…and its lowercase places veto", W.writtenForms([packWit], "nl").get("wit") === "Wit" && !W.writtenForms([packWit, wovenLower], "nl").has("wit"));

// 4. Dutch's IJ: as written when the word is seen whole, and capitalized as one letter from a form.
check("IJsland as written", formsOf("nl", [[["Ik", "ik"], ["woon", "wonen"], ["in", "in"], ["IJsland.", "ijsland"]]]).get("ijsland") === "IJsland");
check("IJslands from a form (IJslandse): IJ, one letter", formsOf("nl", [[["Een", "een"], ["IJslandse", "ijslands"], ["paard.", "paard"]]]).get("ijslands") === "IJslands");
check("capitalized(): a plain word, Turkish's dotted i, Dutch's ij", W.capitalized("engels", "nl") === "Engels" && W.capitalized("istanbul", "tr") === "İstanbul" && W.capitalized("ijs", "nl") === "IJs");

// 5. German: nouns are keyed capitalized already and stay so; its verbs stay lowercase.
const german = pack("starter-de.json").items.filter((item) => Array.isArray(item.words)).map((item) => item.words);
const de = formsOf("de", german);
const verbs = german.flatMap((words) => words.slice(1).filter(([text, lemma]) => lemma && /^\p{Ll}/u.test(lemma) && /^\p{Ll}/u.test(text)).map(([, lemma]) => lemma));
check("German: a lowercase lemma always lowercase mid-sentence stays so", verbs.length > 0 && verbs.every((lemma) => !de.has(lemma) || de.get(lemma) === lemma), verbs.filter((l) => de.has(l)).join(", "));
W.setPackWriting("de", tallyOf("de", german));
check("German: Kaffee shows as its key, Kaffee", W.writtenOf("de", "Kaffee") === "Kaffee");

// 6. A script with no case: nothing counted, nothing changed.
const ja = formsOf("ja", [[["私は", "私"], ["コーヒーを", "コーヒー"], ["飲みます。", "飲む"]]]);
check("Japanese: no case, nothing changed", ja.size === 0);

// 7. In use: the packs' tally, then books kept on the device.
W.setPackWriting("nl", tallyOf("nl", dutch));
check("writtenOf: the packs' Engels; a word the packs don't have, its key", W.writtenOf("nl", "engels") === "Engels" && W.writtenOf("nl", "nederland") === "nederland");
W.noteBook("nl", "book-a", [[["Ik", "ik"], ["woon", "wonen"], ["in", "in"], ["Nederland.", "nederland"]], [["Het", "het"], ["huis", "huis"], ["is", "zijn"], ["groot.", "groot"]]]);
check("a book adds a word only it has: Nederland", W.writtenOf("nl", "nederland") === "Nederland");
const stored = JSON.parse(kept.get("lx.written.books.v1"));
check("what's kept of a book: only what can change what's shown", Object.keys(stored.nl["book-a"]).join() === "nederland", JSON.stringify(stored.nl["book-a"]));
W.noteBook("nl", "book-b", [[["Hij", "hij"], ["leert", "leren"], ["engels", "engels"], ["op", "op"], ["school.", "school"]]]);
check("a book that has engels lowercase mid-sentence vetoes the packs' Engels", W.writtenOf("nl", "engels") === "engels");
W.forgetBook("nl", "book-b");
check("…until it's gone from the device", W.writtenOf("nl", "engels") === "Engels");
// Read back by a fresh copy of the module (the next start), from what's kept.
const again = await import(`${join(ROOT, "public/js/study/written.js")}?again`);
check("kept across a start: a book's Nederland", again.writtenOf("nl", "nederland") === "Nederland");

// 8. Every Dutch pack: the decision from the capitalized candidates is a full sweep's, and takes well under a millisecond.
const { readdirSync } = await import("node:fs");
const all = ["path-nl.json", ...readdirSync(join(ROOT, "packs")).filter((f) => /^words-nl-\d+\.json$/.test(f))].flatMap((f) => pack(f).items.filter((item) => Array.isArray(item.words)).map((item) => item.words));
const big = tallyOf("nl", all);
const sweep = new Map();
for (const [lemma, [mid, cap, form]] of big) if (mid > 0 && cap === mid) sweep.set(lemma, form ?? W.capitalized(lemma, "nl"));
const fromCandidates = W.writtenForms([big], "nl");
check(`every Dutch pack (${big.size} lemmas): the candidates' decision is a full sweep's (${sweep.size} forms)`, fromCandidates.size === sweep.size && [...sweep].every(([l, f]) => fromCandidates.get(l) === f));
const runs = [];
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  W.writtenForms([big], "nl");
  runs.push(performance.now() - start);
}
runs.sort((a, b) => a - b);
check(`…deciding takes ${runs[15].toFixed(3)} ms (median of 30), under 0.5`, runs[15] < 0.5);

// 9. onWritten: told after the task, once, when a shown form changes; never for a change that leaves them as they were.
const told = [];
const stop = W.onWritten(() => told.push(performance.now()));
const settle = () => new Promise((r) => setTimeout(r, 0));
W.setPackWriting("nl", tallyOf("nl", dutch));
await settle();
const afterSame = told.length;
W.setPackWriting("nl", tallyOf("nl", [...dutch, [["Hij", "hij"], ["woont", "wonen"], ["in", "in"], ["Utrecht.", "utrecht"]]]));
const syncAfterChange = told.length;
await settle();
check("onWritten: nothing for a new view that shows the same forms", afterSame === 0, String(afterSame));
check("…told once for one that adds Utrecht, after the task (not inside it)", syncAfterChange === 0 && told.length === 1, `${syncAfterChange}, ${told.length}`);
W.noteBook("nl", "book-c", [[["Ze", "ze"], ["gaat", "gaan"], ["naar", "naar"], ["Gent.", "gent"]]]);
await settle();
check("…and for a book that adds Gent", told.length === 2 && W.writtenOf("nl", "gent") === "Gent", String(told.length));
W.noteBook("nl", "book-c", [[["Ze", "ze"], ["gaat", "gaan"], ["naar", "naar"], ["Gent.", "gent"]]]);
await settle();
check("…not for the same book noted again", told.length === 2, String(told.length));
stop();

console.log(fails.length ? `${fails.length} FAILED` : "all passed");
process.exit(fails.length ? 1 : 0);
