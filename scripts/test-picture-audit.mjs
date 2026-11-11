// The picture audit (scripts/picture-audit.mjs) on a small app of its own: a map line's sentences come from every pack of its language,
// a field's only from its own lesson; a first audit finds every line new; once recorded nothing is; a sentence added to any pack of the
// language, or one whose words change, is new again and nothing else is; a line pointed at another drawing is new; a line to a drawing
// not made yet isn't listed; the command exits 1 while something is new and 0 once --save has recorded it.
// Usage: node scripts/test-picture-audit.mjs   (exit 0 = pass)
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newSince, picturedNow, recordOf } from "./picture-audit.mjs";

let failed = 0;
const check = (name, problems) => {
  const list = problems.filter(Boolean);
  console.log(`${list.length ? "FAIL" : "ok  "}  ${name}${list.length ? ": " + list.join("; ") : ""}`);
  if (list.length) failed++;
};
const dir = mkdtempSync(join(tmpdir(), "picture-audit-"));
const write = (file, data) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), JSON.stringify(data)); };
const item = (id, text, means, words) => ({ id, text, means, words });
const path = (items, lessons) => ({ format: "lexicommons-pack", version: 2, id: "path-xx", language: "xx", items, lessons });
const starter = (items) => ({ format: "lexicommons-pack", version: 2, id: "starter-xx", language: "xx", items });
write("public/pictures/manifest.json", { version: 1, pictures: { place: {}, ready: {}, good: {} } });
write("public/pictures/words.xx.json", { language: "xx", words: { hier: "place", gut: "good", lauf: "run" } });
const lessonItems = [item("a1", "Hier ist es.", "It's here.", [["Hier", "hier"], ["ist", "sein"], ["es", "es"]]),
                     item("a2", "Es ist fertig.", "It's ready.", [["Es", "es"], ["ist", "sein"], ["fertig", "fertig"]]),
                     item("b1", "Fertig machen!", "Get ready!", [["Fertig", "fertig"], ["machen", "machen"]])];
const lessons = [{ id: "l1", words: [{ lemma: "hier" }, { lemma: "fertig", picture: "ready" }], items: ["a1", "a2"] }, { id: "l2", words: [{ lemma: "machen" }], items: ["b1"] }];
write("packs/path-xx.json", path(lessonItems, lessons));
// a word with a reading ([text, lemma, reading], as Japanese, Chinese and Arabic write theirs) counts by its lemma; one with none ([text],
// [text, null, reading]) counts for nothing
write("packs/starter-xx.json", starter([item("s1", "Gut, hier!", "Good, here!", [["Gut", "gut"], ["hier", "hier", "hiːɐ̯"]]),
                                         item("s2", "Hm, gut.", "Hm, good.", [["Hm"], ["gut", null, "guːt"]])]));

const now = picturedNow(dir);
const lines = now.xx ?? {};
check("a map line's sentences come from every pack of its language, a word by its lemma whether it has a reading or not", [
  !lines["map:hier"] && "hier isn't listed",
  lines["map:hier"]?.sentences.map((s) => s.key).sort().join(",") !== "path-xx:a1,starter-xx:s1" && `hier's sentences: ${lines["map:hier"]?.sentences.map((s) => s.key)}`,
  lines["map:gut"]?.sentences.map((s) => s.key).join(",") !== "starter-xx:s1" && `gut's sentences: ${lines["map:gut"]?.sentences.map((s) => s.key)} (s2's gut has no lemma)`,
]);
check("a field's sentences come only from its own lesson", [
  !lines["field:path-xx/l1/fertig"] && "fertig's field isn't listed",
  lines["field:path-xx/l1/fertig"]?.sentences.map((s) => s.key).join(",") !== "path-xx:a2" && `fertig's sentences: ${lines["field:path-xx/l1/fertig"]?.sentences.map((s) => s.key)} (l2's b1 is another lesson)`,
]);
check("a line to a drawing not made yet isn't listed", [lines["map:lauf"] && "lauf -> run (no such drawing) is listed"]);
const first = newSince(now, {});
check("a first audit finds every line new", [(first.xx ?? []).length !== Object.keys(lines).length && `${(first.xx ?? []).length} of ${Object.keys(lines).length} new`]);
const record = recordOf(now, { yy: { "map:x": { picture: "place", sentences: {} } } });
check("once recorded nothing is new, and another language's record is kept", [
  Object.keys(newSince(now, record)).length && "something is still new",
  !record.yy && "yy's record was dropped",
]);
// a new lesson sentence using a mapped word, and a starter sentence whose words changed
lessonItems.push(item("a3", "Hier im Sommer.", "Here in summer.", [["Hier", "hier"], ["im", "im"], ["Sommer", "sommer"]]));
lessons[0].items.push("a3");
write("packs/path-xx.json", path(lessonItems, lessons));
write("packs/starter-xx.json", starter([item("s1", "Gut, hier bin ich!", "Good, here I am!", [["Gut", "gut"], ["hier", "hier", "hiːɐ̯"], ["bin", "sein"], ["ich", "ich"]]),
                                         item("s2", "Hm, gut.", "Hm, good.", [["Hm"], ["gut", null, "guːt"]])]));
const later = newSince(picturedNow(dir), record);
const freshOf = (key) => (later.xx ?? []).find((l) => l.key === key)?.fresh.map((s) => s.key).sort().join(",") ?? "";
check("a sentence added to any pack, or one changed, is new; nothing else is", [
  freshOf("map:hier") !== "path-xx:a3,starter-xx:s1" && `hier's new: ${freshOf("map:hier")}`,
  freshOf("map:gut") !== "starter-xx:s1" && `gut's new: ${freshOf("map:gut")}`,
  freshOf("field:path-xx/l1/fertig") && `fertig's field has new sentences: ${freshOf("field:path-xx/l1/fertig")}`,
]);
const moved = JSON.parse(JSON.stringify(record)); moved.xx["map:gut"].picture = "place";
check("a line now pointing at another drawing is new", [!(newSince(picturedNow(dir), moved).xx ?? []).find((l) => l.key === "map:gut" && l.lineIsNew) && "gut's changed picture wasn't flagged"]);
// the command: 1 while something is new, 0 once saved, and its record kept where it's told
const script = join(dirname(fileURLToPath(import.meta.url)), "picture-audit.mjs");
const run = (...extra) => { try { execFileSync("node", [script, dir, "--record", join(dir, "audit.json"), ...extra], { stdio: "pipe" }); return 0; } catch (e) { return e.status; } };
check("the command exits 1 while something is new, 0 once --save has recorded it", [
  run() !== 1 && "not 1 before any audit", run("--save") !== 0 && "--save didn't exit 0", run() !== 0 && "not 0 after --save",
]);
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
