// A language's typography as shown (lang/index.js typeset and endMark; French's spaceBefore), and items as the screens
// show them (study/pack-format.js shownItem, which Study's content.js and Practice's cards use). A rendering rule only: what's stored and what answers are matched
// against never change. Pure, so it runs in Node: `node scripts/test-typeset.mjs` (exit 0 = pass).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGES, endMark, spaceBeforeNext, typeset } from "../public/js/lang/index.js";
import { itemSentence, shownItem } from "../public/js/study/pack-format.js";
import { words } from "../public/js/speech/match.js";

const HERE = dirname(fileURLToPath(import.meta.url));
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
const show = (text) => JSON.stringify(text).replace(/ /g, "⍽").replace(/ /g, "␣");
const eq = (actual, expected) => {
  if (actual !== expected) throw new Error(`${show(actual)} ≠ ${show(expected)}`);
};
const NNBSP = " ";
const NBSP = " ";

test("French: a narrow no-break space before ? ! ; and a no-break space before :", () => {
  eq(typeset("fr", "Tu viens?"), `Tu viens${NNBSP}?`);
  eq(typeset("fr", "C'est ça!"), `C'est ça${NNBSP}!`);
  eq(typeset("fr", "Bonjour; ça va?"), `Bonjour${NNBSP}; ça va${NNBSP}?`);
  eq(typeset("fr", "Attention: le train part."), `Attention${NBSP}: le train part.`);
});
test("French: a run of marks takes one space, before the first (Quoi ?!)", () => {
  eq(typeset("fr", "Quoi?!"), `Quoi${NNBSP}?!`);
  eq(typeset("fr", "Quoi !?"), `Quoi${NNBSP}!?`);
});
test("French: a plain or wrong space before a mark becomes the right one, and typeset twice is typeset once", () => {
  eq(typeset("fr", "Tu viens ?"), `Tu viens${NNBSP}?`);
  eq(typeset("fr", `Attention${NNBSP}: oui`), `Attention${NBSP}: oui`);
  const once = typeset("fr", "Quoi ?! Attention: oui; non?");
  eq(typeset("fr", once), once);
});
test("French: a time's colon, a mark with nothing before it and full stops and commas are left alone", () => {
  eq(typeset("fr", "Le train part à 10:30."), "Le train part à 10:30.");
  eq(typeset("fr", "?"), "?");
  eq(typeset("fr", "J'en veux deux, s'il vous plaît."), "J'en veux deux, s'il vous plaît.");
});
test("every other language, an unknown code and anything that isn't text come back unchanged", () => {
  for (const code of Object.keys(LANGUAGES)) if (code !== "fr") eq(typeset(code, "¿Qué? Attention: oui!"), "¿Qué? Attention: oui!");
  eq(typeset("xx", "Tu viens?"), "Tu viens?");
  eq(typeset(undefined, "Tu viens?"), "Tu viens?");
  if (typeset("fr", null) !== null) throw new Error("null wasn't passed through");
});
test("endMark: a sentence's end mark as shown after its last word", () => {
  eq(endMark("fr", "?"), `${NNBSP}?`);
  eq(endMark("fr", "?!"), `${NNBSP}?!`);
  eq(endMark("fr", "."), ".");
  eq(endMark("fr", ""), "");
  eq(endMark("nl", "?"), "?");
});
test("spaceBeforeNext: the space before a token that starts with a mark, the same one typeset puts in", () => {
  eq(spaceBeforeNext("fr", "?"), NNBSP);
  eq(spaceBeforeNext("fr", "?!"), NNBSP);
  eq(spaceBeforeNext("fr", ":"), NBSP);
  eq(spaceBeforeNext("fr", "viens"), null);
  eq(spaceBeforeNext("fr", ""), null);
  eq(spaceBeforeNext("es", "?"), null);
  eq(spaceBeforeNext("xx", "?"), null);
  for (const marks of ["?", "!", ";", ":", "?!"]) eq(typeset("fr", `oui${marks}`), `oui${spaceBeforeNext("fr", marks)}${marks}`);
});
test("only French has spaceBefore so far, and each one maps a mark to a space", () => {
  for (const [code, lang] of Object.entries(LANGUAGES)) {
    if (lang.spaceBefore === undefined) continue;
    for (const [mark, space] of Object.entries(lang.spaceBefore)) {
      if (!["?", "!", ";", ":"].includes(mark) || ![NNBSP, NBSP, " "].includes(space)) throw new Error(`${code}: ${show(mark)} → ${show(space)}`);
    }
  }
});

const FR = JSON.parse(readFileSync(join(HERE, "../packs/starter-fr.json"), "utf8"));
test("French starter: typeset never changes the words a typed or spoken answer is matched on", () => {
  for (const item of FR.items) {
    for (const text of [itemSentence(item), ...item.wrong, ...(item.otherGender ? [item.otherGender.text] : [])]) eq(words(typeset("fr", text), "fr").join(" "), words(text, "fr").join(" "));
  }
});
test("French starter, as Study shows it: the right sentence and every wrong version end alike, so the spacing gives nothing away", () => {
  for (const item of FR.items) {
    const shown = shownItem(item, "fr");
    const right = shown.words.map(([text]) => text).join(" ") + shown.punct;
    const tail = (text) => /[ \u00a0\u202f]?[?!.…;:]*$/u.exec(text)[0];
    for (const wrong of shown.wrong) if (tail(wrong) !== tail(right)) throw new Error(`${item.id}: ${show(right)} vs ${show(wrong)}`);
    if (item.punct === "?" && !right.endsWith(`${NNBSP}?`)) throw new Error(`${item.id}: ${show(right)}`);
  }
});
// The other gender's sentence (otherGender, 8 Nov 2026) is typeset as its sentence is, the drawer's "A woman says: Tu es professeure ?"
// spaced like the sentence above it (shownItem); its gender and who stay as they are.
test("French starter, as Study shows it: the other gender's sentence ends as its sentence does", () => {
  const withOther = FR.items.filter((i) => i.otherGender);
  if (!withOther.length) throw new Error("starter-fr has no otherGender to show");
  for (const item of withOther) {
    const shown = shownItem(item, "fr");
    if (item.punct === "?" && !shown.otherGender.text.endsWith(`${NNBSP}?`)) throw new Error(`${item.id}: ${show(shown.otherGender.text)}`);
    eq(JSON.stringify({ ...shown.otherGender, text: item.otherGender.text }), JSON.stringify(item.otherGender));
  }
});
test("Study's items keep everything else: id, words, gap, literal; a Dutch item comes back as it was", () => {
  const item = FR.items.find((i) => i.punct === "?");
  const shown = shownItem(item, "fr");
  eq(JSON.stringify({ ...shown, punct: item.punct, wrong: item.wrong, ...(item.otherGender ? { otherGender: item.otherGender } : {}) }), JSON.stringify(item));
  const nl = { id: "x", words: [["Hoe"], ["gaat"], ["het"]], punct: "?", wrong: ["Hoe het gaat?"] };
  if (shownItem(nl, "nl") !== nl) throw new Error("a Dutch item was copied or changed");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
