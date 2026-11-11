// lx-app (scratch): the weave guide's Spanish worked example from Peter Rabbit's judged layer (stories-es-2/set2, 0 of 62 misleading):
// its sentences 1 and 8 as a text of their own, numbered as get_text hands them over, and the layer's entries in the guide's form.
// node es-example.mjs <app dir> <pipelines/books dir>
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const APP = resolve(process.argv[2]);
await import(pathToFileURL(join(APP, "scripts/fixtures/worker-env.mjs")).href);
const { bookFromText } = await import(pathToFileURL(join(APP, "public/js/read/import-text.js")).href);
const { numberedSentences, answerFromWeave } = await import(pathToFileURL(join(APP, "src/weave-answer.ts")).href);
const RUN = resolve(process.argv[3], "work/potter-peter-rabbit");
const source = JSON.parse(readFileSync(join(RUN, "book/potter-peter-rabbit.eb70c30d84fa746b.json"), "utf8"));
const layer = JSON.parse(readFileSync(join(RUN, "runs/stories-es-2/set2/weave.es.b5a35fd7b846.json"), "utf8"));
const picked = [1, 8].map((i) => layer.sentences[i]);
const text = picked.map((s) => source.words.slice(s.s, s.e).join(" ")).join("\n\n");
const book = await bookFromText(text, { lang: "en", title: "Peter Rabbit" });
const to_weave = numberedSentences(book);
// The same words, sentence by sentence, as the judged layer had them.
const same = to_weave.length === picked.length && picked.every((s, x) => JSON.stringify(source.words.slice(s.s, s.e)) === JSON.stringify(to_weave[x].words));
// The layer's two sentences re-anchored to this text (their own s and e), then in the guide's form.
let at = 0;
const mini = { ...layer, sentences: picked.map((s, x) => { const n = s.e - s.s; const one = { ...s, s: at, e: at + n }; at += n; return one; }) };
const answer = answerFromWeave({ ...book, words: book.words }, mini);
console.log(JSON.stringify({ same, text, to_weave, weave: answer }, null, 1));
process.exit(0);
