// A gap's marks (public/js/study/gap-marks.js): a closing mark after the gap and an opening one before it, never part of a choice, on cases
// and on every gap of every pack in packs/. The rule from before (closing marks only) is the control: it left Spanish's "¿" inside every
// choice ("¿Tienes", "¿Tenemos", "¿Tengo") and the sentence starting at the blank with no "¿" before it (exit 0 = pass).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bareChoice, gapMarks, GAP_TAIL } from "../public/js/study/gap-marks.js";
import { fillChoice } from "./fixtures/step-text.mjs";

const APP = join(fileURLToPath(new URL(".", import.meta.url)), "..");
let failed = 0, passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
};
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
};

test("a word's marks on either side, the word itself what's chosen", () => {
  eq(gapMarks("koffie,"), { head: "", bare: "koffie", tail: "," }, "koffie,");
  eq(gapMarks("¿Tenemos"), { head: "¿", bare: "Tenemos", tail: "" }, "¿Tenemos");
  eq(gapMarks("¡Hola!"), { head: "¡", bare: "Hola", tail: "!" }, "¡Hola!");
  eq(gapMarks("Sí,"), { head: "", bare: "Sí", tail: "," }, "Sí,");
  eq(gapMarks("“Ahora"), { head: "“", bare: "Ahora", tail: "" }, "“Ahora");
  eq(gapMarks("'s"), { head: "", bare: "'s", tail: "" }, "Dutch's 's: the apostrophe is part of the word");
  eq(gapMarks("estás?"), { head: "", bare: "estás", tail: "?" }, "estás?");
  eq(gapMarks("drink"), { head: "", bare: "drink", tail: "" }, "drink");
  eq(gapMarks("¿"), { head: "", bare: "¿", tail: "" }, "a word that is only a mark keeps it");
});

test("a choice loses the gap word's own marks, and only those", () => {
  const marks = gapMarks("¿Tenemos");
  eq(["¿Tenemos", "¿Tienes", "¿Tengo"].map((c) => bareChoice(c, marks)), ["Tenemos", "Tienes", "Tengo"], "the ¿ choices");
  eq(["Tienes", "Tengo"].map((c) => bareChoice(c, marks)), ["Tienes", "Tengo"], "choices that never had it");
  eq(["koffie,", "thee,", "melk"].map((c) => bareChoice(c, gapMarks("koffie,"))), ["koffie", "thee", "melk"], "Dutch's commas, as before");
});

test("the control: the rule from before left the opening mark in every choice", () => {
  const before = (text, written) => {
    const tail = GAP_TAIL.exec(written)?.[0] ?? "";
    return tail && text.endsWith(tail) ? text.slice(0, -tail.length) : text;
  };
  const old = ["¿Tenemos", "¿Tienes", "¿Tengo"].map((c) => before(c, "¿Tenemos"));
  if (!old.every((c) => c.startsWith("¿"))) throw new Error(`the old rule already took it off: ${old}`);
});

// Every gap of every pack here: the marks put back give the word as written, a choice is never empty, no choice of a gap whose word opens
// with a mark still opens with it, and the session player's fillChoice is the game's choice. Dutch's gaps have no opening marks, so what
// Dutch learners see is as before.
const packs = readdirSync(join(APP, "packs")).filter((n) => n.endsWith(".json")).map((n) => JSON.parse(readFileSync(join(APP, "packs", n), "utf8")));
test("every gap of every pack: marks round trip, choices never empty, never an opening mark left in a choice, the player's choice the game's; none in Dutch", () => {
  const problems = [];
  const heads = {};
  for (const pack of packs)
    for (const item of pack.items ?? []) {
      if (!item.gap || !item.words) continue;
      const written = item.words[item.gap.index][0];
      const marks = gapMarks(written);
      if (marks.head + marks.bare + marks.tail !== written) problems.push(`${pack.id}/${item.id}: ${written} doesn't round trip`);
      if (fillChoice(written) !== marks.bare) problems.push(`${pack.id}/${item.id}: the player looks for ${fillChoice(written)}, the game shows ${marks.bare}`);
      if (marks.head) heads[pack.language] = (heads[pack.language] ?? 0) + 1;
      for (const option of item.gap.options) {
        const text = typeof option === "string" ? option : option.text;
        const shown = bareChoice(text, marks);
        if (!shown) problems.push(`${pack.id}/${item.id}: choice ${text} would be empty`);
        if (marks.head && shown.startsWith(marks.head)) problems.push(`${pack.id}/${item.id}: choice ${text} keeps ${marks.head}`);
        // The one session player every check plays with (fixtures/play-session.mjs) looks for the choice as the game shows it.
        if (fillChoice(text, written) !== shown) problems.push(`${pack.id}/${item.id}: the player looks for ${fillChoice(text, written)}, the game shows ${shown}`);
      }
    }
  if (heads.nl) problems.push(`Dutch has ${heads.nl} gaps with an opening mark`);
  if (problems.length) throw new Error(problems.slice(0, 6).join("; "));
  console.log(`      gaps with an opening mark, by language: ${JSON.stringify(heads)}`);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
