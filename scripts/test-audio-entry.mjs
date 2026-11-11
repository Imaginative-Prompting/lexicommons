#!/usr/bin/env node
// What an audio publish writes into the catalog (src/library-admin.ts audioChange), against a catalog changed while it ran (6 Nov 2026, the
// Codex review's C10: it rebuilt the entry from what the catalog said when the publish began, so an opt-in set meanwhile was undone):
//   - the entry keeps what the catalog says when it's written: opt-in (and suggested) set meanwhile stays, and so does it taken off;
//   - the recordings go on it, and every other pack and language is as it was;
//   - a pack moved to another version meanwhile is refused, its audio not put on (the rule from before, a control that this can refuse).
// `node scripts/test-audio-entry.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import "./fixtures/worker-env.mjs";

const admin = await import("../src/library-admin.ts");
const { catalogueEntry, packRefs, withPackEntry } = await import("../public/js/study/pack-format.js");

const sentence = (id, text, lemmas, means) => {
  const words = text.replace(/[.?!]$/, "").split(" ").map((word) => [word, lemmas[word] ?? word.toLowerCase()]);
  return { id, concepts: ["v2"], text, means, words, punct: ".", literal: text.split(" ").map((w) => [w]), english: null, moved: [], wrong: [`${text} nee`], gap: { index: words.length - 1, options: [words.at(-1)[0], "iets"] } };
};
const pack = {
  format: "lexicommons-pack", version: 2, id: "drinks-audio", name: "Drinks", about: "For a check.", language: "nl", from: "en", topics: {}, chunks: {}, patterns: {},
  words: { ik: "I", drinken: "to drink", thee: "tea" },
  items: [sentence("thee", "Ik drink thee.", { Ik: "ik", drink: "drinken", thee: "thee" }, "I drink tea.")],
};
const V1 = "0123456789ab";
const V2 = "ba9876543210";
const AUDIO = `/library/packs/${pack.id}/${V1}/audio.00112233aabb.json`;
const other = { ...pack, id: "other-pack", name: "Other" };
const start = (flags = {}) => withPackEntry(withPackEntry({ packs: {} }, "nl", catalogueEntry(other, V1)), "nl", catalogueEntry(pack, V1, flags));
const refOf = (catalogue, id = pack.id) => packRefs(catalogue, "nl").find((r) => r.id === id);

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 4).join("\n        ")}`);
  }
};

test("opt-in set while the audio was being checked stays opt-in, and suggested", () => {
  const before = start();
  const found = { lang: "nl", ref: refOf(before) };
  assert.equal(found.ref.optIn, undefined, "the start isn't a default pack");
  const meanwhile = withPackEntry(before, "nl", catalogueEntry(pack, V1, { optIn: true, suggest: true }));
  const { catalogue, problems } = admin.audioChange(found, pack, AUDIO)(meanwhile);
  assert.deepEqual(problems, []);
  const ref = refOf(catalogue);
  assert.equal(ref.audio, AUDIO, "its recordings aren't on it");
  assert.equal(ref.optIn, true, "opt-in set meanwhile was undone");
  assert.equal(ref.suggest, true, "suggested set meanwhile was undone");
});

test("opt-in taken off meanwhile stays off", () => {
  const before = start({ optIn: true, suggest: true });
  const found = { lang: "nl", ref: refOf(before) };
  const meanwhile = withPackEntry(before, "nl", catalogueEntry(pack, V1));
  const ref = refOf(admin.audioChange(found, pack, AUDIO)(meanwhile).catalogue);
  assert.equal(ref.optIn, undefined, "an opt-in taken off meanwhile came back");
  assert.equal(ref.suggest, undefined);
  assert.equal(ref.audio, AUDIO);
});

test("nothing changed meanwhile: the entry as it was, with its recordings; every other pack as it was", () => {
  const before = start({ optIn: true });
  const found = { lang: "nl", ref: refOf(before) };
  const { catalogue } = admin.audioChange(found, pack, AUDIO)(before);
  assert.deepEqual(refOf(catalogue), { ...refOf(before), audio: AUDIO });
  assert.deepEqual(refOf(catalogue, other.id), refOf(before, other.id));
});

test("the control: a pack moved to another version meanwhile is refused, its audio not put on", () => {
  const before = start();
  const found = { lang: "nl", ref: refOf(before) };
  const meanwhile = withPackEntry(before, "nl", catalogueEntry(pack, V2));
  const { catalogue, problems } = admin.audioChange(found, pack, AUDIO)(meanwhile);
  assert.equal(catalogue, null);
  assert.match(problems.join(" "), /isn't at 0123456789ab on the catalog any more/);
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
