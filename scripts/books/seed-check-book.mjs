#!/usr/bin/env node
// A small Dutch book with an English help layer, in a LOCAL library, so a check's Translate reaches a book's sentences: long
// ones (shown clipped, a tap shows them whole), a short one, and a word no word pack has (kaarsvetvlek). It only ever writes to the wrangler
// state you name, and it never touches the live library.
//   node scripts/books/seed-check-book.mjs --persist-to <wrangler state dir>     (outside the command sandbox: wrangler)
// As a module: seedCheckBook(persist) returns restore(), which puts the catalog back as it found it; the sentences are CHECK_BOOK.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bookVersion, segmentSentences, sentenceHash, tokenize, validateBook, validateWeave } from "../../public/js/read/book-format.js";
import { bookPrefix, emptyCatalogue, layerEntry, layerKey, withBook } from "../../public/js/read/catalogue.js";
import { localR2 } from "../fixtures/local-r2.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Each sentence: its Dutch, its English, each Dutch word's [gloss, dictionary word], and each English word's Dutch word (by place).
const SENTENCES = [
  {
    nl: "Het oude boek dat oma altijd op de hoogste plank van de kast bewaarde lag op een regenachtige middag ineens open op de keukentafel.",
    en: "The old book that grandma always kept on the highest shelf of the cupboard lay suddenly open on the kitchen table one rainy afternoon.",
    t: [["The", "het"], ["old", "oud"], ["book", "boek"], ["that", "dat"], ["grandma", "oma"], ["always", "altijd"], ["on", "op"], ["the", "de"], ["highest", "hoog"], ["shelf", "plank"], ["of", "van"], ["the", "de"], ["cupboard", "kast"], ["kept", "bewaren"], ["lay", "liggen"], ["on", "op"], ["a", "een"], ["rainy", "regenachtig"], ["afternoon", "middag"], ["suddenly", "ineens"], ["open", "open"], ["on", "op"], ["the", "de"], ["kitchen table.", "keukentafel"]],
    from: [0, 1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 10, 11, 12, 14, 19, 20, 21, 22, 23, 23, 16, 17, 18],
  },
  {
    nl: "Ik las het boek tot de kaars op was.",
    en: "I read the book until the candle had burned down.",
    t: [["I", "ik"], ["read", "lezen"], ["the", "het"], ["book", "boek"], ["until", "tot"], ["the", "de"], ["candle", "kaars"], ["down", "op"], ["had burned.", "zijn"]],
    from: [0, 1, 2, 3, 4, 5, 6, 8, 8, 7],
  },
  {
    nl: "Op de eerste bladzijde zat een kaarsvetvlek die ik de volgende ochtend pas zag, maar het verhaal liet me nog altijd niet los.",
    en: "On the first page was a candle wax stain that I only saw the next morning, but the story still wouldn't let me go.",
    t: [["On", "op"], ["the", "de"], ["first", "eerst"], ["page", "bladzijde"], ["was", "zitten"], ["a", "een"], ["candle wax stain", "kaarsvetvlek"], ["that", "die"], ["I", "ik"], ["the", "de"], ["next", "volgend"], ["morning", "ochtend"], ["only", "pas"], ["saw,", "zien"], ["but", "maar"], ["the", "het"], ["story", "verhaal"], ["let", "laten"], ["me", "me"], ["still", "nog"], ["ever", "altijd"], ["not", "niet"], ["go.", "los"]],
    from: [0, 1, 2, 3, 4, 5, 6, 6, 6, 7, 8, 12, 13, 9, 10, 11, 14, 15, 16, 19, 21, 17, 18, 22],
  },
];
export const CHECK_BOOK = {
  id: "check-book-keukentafel",
  title: "Het boek op de keukentafel",
  credit: "Translated for the check",
  sentences: SENTENCES.map(({ nl, en }) => ({ nl, en })),
};

export async function checkBookFiles() {
  const words = tokenize(SENTENCES.map((s) => s.nl).join(" "), "nl");
  const paras = [{ k: "p", s: 0, e: words.length }];
  const name = "Check Writer";
  const book = {
    format: "lexicommons-book",
    v: 1,
    id: CHECK_BOOK.id,
    version: "",
    title: CHECK_BOOK.title,
    authors: [{ name, role: "author" }],
    lang: "nl",
    source: { kind: "paste" },
    rights: { us: false, eu: false, spdx: "CC-BY-4.0", licence: "CC BY 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/", basis: "made for the check", attribution: [{ role: "author", name }], attributionText: `${CHECK_BOOK.title}, by ${name}, CC BY 4.0` },
    words,
    italic: [],
    paras,
    chapters: [{ title: "One", para: 0 }],
    sentences: segmentSentences(words, paras, "nl"),
  };
  book.version = await bookVersion(book);
  const sentences = [];
  for (const [x, [s, e]] of book.sentences.entries()) {
    const { en, t, from } = SENTENCES[x];
    const dutch = words.slice(s, e);
    const m = en.split(" ").map((token, j) => [token, dutch[from[j]], [from[j]], null]);
    sentences.push({ s, e, h: await sentenceHash(words, s, e), t, text: en, m });
  }
  const layer = { format: "lexicommons-weave", v: 1, kind: "help", book: book.id, bookVersion: book.version, from: "nl", to: "en", licence: "CC BY-SA 4.0", credit: CHECK_BOOK.credit, made: { pipeline: "seed-check-book", at: "2026-11-04T00:00:00.000Z" }, sentences };
  const problems = [...(await validateBook(book)), ...(await validateWeave(layer, book))];
  if (problems.length) throw new Error(`the check's book doesn't pass: ${problems.slice(0, 4).join(" · ")}`);
  return { book, layer };
}

export async function seedCheckBook(persist) {
  const scratch = mkdtempSync(join(tmpdir(), "check-book-"));
  const wrangler = (args) => execFileSync("npx", ["wrangler", ...args, "--local", "--persist-to", persist], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  // The seeding through one bucket in this process (scripts/fixtures/local-r2.mjs), closed before it returns.
  const r2 = localR2(APP, persist);
  let original = null;
  try {
    original = await r2.getText("lexicommons-library", "catalogue.json");
    if (original !== null && JSON.parse(original).books?.some((entry) => entry.id === CHECK_BOOK.id)) return () => rmSync(scratch, { recursive: true, force: true });
    const { book, layer } = await checkBookFiles();
    await r2.put("lexicommons-library", `${bookPrefix(book)}/book.json`, JSON.stringify(book), "application/json");
    const layerText = JSON.stringify(layer);
    const key = layerKey(book, layer, createHash("sha256").update(layerText).digest("hex"));
    await r2.put("lexicommons-library", key, layerText, "application/json");
    const shelved = withBook(original === null ? emptyCatalogue() : JSON.parse(original), book, { en: layerEntry(layer, key) }, new Date().toISOString());
    if (!shelved.catalogue) throw new Error(shelved.problems.join(" · "));
    await r2.put("lexicommons-library", "catalogue.json", JSON.stringify(shelved.catalogue, null, 2), "application/json");
  } finally {
    await r2.close();
  }
  // Putting the catalog back stays synchronous, as its callers call it (translate-check doesn't wait on it): one wrangler call.
  const put = (key, text) => {
    writeFileSync(join(scratch, "put.json"), text);
    wrangler(["r2", "object", "put", `lexicommons-library/${key}`, "--file", join(scratch, "put.json"), "--content-type", "application/json"]);
  };
  return () => {
    if (original !== null) put("catalogue.json", original);
    else wrangler(["r2", "object", "delete", "lexicommons-library/catalogue.json"]);
    rmSync(scratch, { recursive: true, force: true });
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--persist-to");
  if (at < 0) throw new Error("--persist-to <wrangler state dir> is required");
  await seedCheckBook(resolve(process.argv[at + 1]));
  console.log(`${CHECK_BOOK.id} seeded`);
}
