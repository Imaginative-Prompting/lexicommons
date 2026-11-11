// The pack relay's server side (src/packs.ts) on the real migrations in SQLite (scripts/fixtures/worker-env.mjs):
// corrections an author accepted in Explore reaching the author's own pack (queueOwnerChange). Only what they change
// is sent, as checked, so the author's own edits stay; busy while a change on its way touches the same sentence or
// entry (it may yet be refused); refused in words when they'd add or take out a sentence, touch the rest of the pack,
// or fail the check; no_copy and nothing; a change landing meanwhile; the devices named are the ones it goes to, a
// device registering before or after; Undo. Then your AI's recordings for a pack of yours (set_pack_audio): each clip
// checked and named by its bytes, merged into the recordings as they will be, served only while its change is on its
// way and gone once every device has it, refusals leaving nothing behind, the limits, a device's copy carrying them, and
// tidying that never takes a recording being claimed. Last, your AI's tools as it calls them (mcp-packs.ts, each argument through
// its tool's own schema): a word written twice, a word to learn then a phrase's, added, read and sent back unchanged.
// Runs in Node: `node scripts/test-pack-relay.mjs` (exit 0 = pass).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, faults, row, rows, reset } = workerEnv();
const { queueOwnerChange, updateItems, editPack, undoChange, putDevice, getPack, putCopy: sendCopy, deleteCopy, relayLatest, setPackAudio, removePackAudio, serveChangeClip, report, listChanges, removeItems, PACK_RELAY } = await import(
  join(APP, "src/packs.ts")
);
const { uploadKey } = await import(join(APP, "src/library.ts"));
const { checkAudio } = await import(join(APP, "public/js/study/pack-audio.js"));
const { checkPack } = await import(join(APP, "public/js/study/pack-format.js"));
const { applyChange } = await import(join(APP, "public/js/study/pack-authoring.js"));
const { withFixes, itemPath, wordPath } = await import(join(APP, "public/js/study/pack-corrections.js"));
const { BUILT_IN } = await import(join(APP, "public/js/packs/index.js"));

// ---------- an author, a device, the author's own pack (as a device sent it) ----------

const OWNER = "user-author";
const DEVICE = "device-author-1";
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(OWNER, "Author", Date.now());
sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, ?, 'Author phone', '[]', ?, ?)").run(OWNER, DEVICE, Date.now(), Date.now());

const starter = BUILT_IN[0];
/** A pack of the author's: three of the starter's sentences under its own id. */
function travel() {
  const items = starter.items.slice(0, 3);
  const words = Object.fromEntries(Object.entries(starter.words).filter(([lemma]) => items.some((item) => item.words.some(([, l]) => l === lemma))));
  const { pack, errors } = checkPack({ ...structuredClone(starter), id: "travel", name: "Travel", about: "Getting around.", words, items: structuredClone(items) }, { installed: [] });
  if (!pack) throw new Error(`the test pack doesn't pass: ${JSON.stringify(errors)}`);
  return pack;
}
const putCopy = (pack, through = 0) =>
  sqlite
    .prepare("INSERT INTO pack_copies (user_id, pack_id, language, pack, through, device_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, pack_id) DO UPDATE SET pack = excluded.pack, through = excluded.through")
    .run(OWNER, pack.id, pack.language, JSON.stringify(pack), through, DEVICE, Date.now());
const changes = () => row("SELECT COUNT(*) AS n FROM pack_changes WHERE user_id = ?", OWNER).n;
/** Every change on its way arrives, as the author's device takes it: applied and kept as checked, its copy sent, its delivery reported. */
function arrive(packId = "travel") {
  let copy = JSON.parse(row("SELECT pack FROM pack_copies WHERE user_id = ? AND pack_id = ?", OWNER, packId).pack);
  let through = 0;
  for (const change of rows("SELECT seq, body FROM pack_changes WHERE user_id = ? AND pack_id = ? AND body IS NOT NULL ORDER BY seq", OWNER, packId)) {
    const body = JSON.parse(change.body);
    if (body.kind !== "undo") {
      const next = applyChange(copy, body);
      const checked = next.pack && checkPack(next.pack, { installed: [] });
      if (checked?.pack) copy = checked.pack;
    }
    through = change.seq;
  }
  if (through) putCopy(copy, through);
  sqlite.prepare("UPDATE pack_deliveries SET state = 'applied', settled_at = ? WHERE user_id = ? AND state = 'waiting'").run(Date.now(), OWNER);
  sqlite.prepare("UPDATE pack_changes SET body = NULL WHERE user_id = ?").run(OWNER);
  return copy;
}
const latest = () => row("SELECT id, kind, body, said, source FROM pack_changes WHERE user_id = ? ORDER BY seq DESC LIMIT 1", OWNER);

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  } finally {
    reset();
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const eq = (actual, expected) => {
  const [a, b] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== b) throw new Error(`${a.slice(0, 400)} ≠ ${b.slice(0, 400)}`);
};
const refusedWith = (outcome, pattern) => {
  ok(!outcome.ok && outcome.reason === "refused", `not refused: ${JSON.stringify(outcome).slice(0, 300)}`);
  ok(outcome.errors.some((e) => pattern.test(e.message)), `refused, but with ${JSON.stringify(outcome.errors)}`);
  return outcome.errors[0].message;
};

const pack = travel();
const [first, second] = pack.items;
const lemma = Object.keys(pack.words)[0];
/** The corrections: the first sentence's natural English, and one word's gloss. */
const fixes = (p) => {
  p.items.find((item) => item.id === first.id).means = "Yesterday I read a book, start to finish.";
  p.words[lemma] = `${pack.words[lemma]} (corrected)`;
  return p;
};

await test("no copy of the pack on the server yet: no_copy, and nothing queued", async () => {
  const outcome = await queueOwnerChange(env, OWNER, { packId: "travel", revise: fixes });
  ok(!outcome.ok && outcome.reason === "no_copy" && changes() === 0, JSON.stringify(outcome));
});

putCopy(pack);

await test("accepted corrections reach the author's pack: only the sentence and the word they change, from Explore, to their devices", async () => {
  const outcome = await queueOwnerChange(env, OWNER, { packId: "travel", revise: fixes });
  ok(outcome.ok && outcome.items === 1 && JSON.stringify(outcome.devices) === '["Author phone"]', JSON.stringify(outcome));
  const change = latest();
  const body = JSON.parse(change.body);
  ok(change.kind === "update" && change.source === "explore:corrections" && change.said === "changed 1 sentence in Travel", JSON.stringify({ kind: change.kind, source: change.source, said: change.said }));
  ok(body.items.length === 1 && body.items[0].id === first.id && body.items[0].means === "Yesterday I read a book, start to finish.", JSON.stringify(body.items.map((i) => i.id)));
  ok(JSON.stringify(Object.keys(body.dictionaries ?? {})) === '["words"]' && JSON.stringify(Object.keys(body.dictionaries.words)) === JSON.stringify([lemma]), JSON.stringify(body.dictionaries));
  ok(row("SELECT state FROM pack_deliveries d JOIN pack_changes c ON c.seq = d.change_seq WHERE c.id = ?", change.id).state === "waiting", "its delivery waits");
  return change.said;
});

await test("the same corrections again: nothing (the pack as it will be already says it), and nothing queued", async () => {
  const before = changes();
  const outcome = await queueOwnerChange(env, OWNER, { packId: "travel", revise: fixes });
  ok(!outcome.ok && outcome.reason === "nothing" && changes() === before, JSON.stringify(outcome));
  ok((await queueOwnerChange(env, OWNER, { packId: "travel", revise: () => null })).reason === "nothing", "revise giving null");
});

await test("Codex's review: a change on its way to another sentence never rides along with the correction (only the corrected sentence goes, from the copy)", async () => {
  arrive();
  // The author's AI rewrites the second sentence (on its way: it may yet be refused or expire on their devices).
  const ai = await updateItems(env, OWNER, "oauth:Claude", { pack_id: "travel", items: [{ ...authoring(second), natural: "My own wording." }] });
  ok(ai.ok, JSON.stringify(ai));
  let seen = null;
  const outcome = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      seen = p.items.find((item) => item.id === second.id).means;
      p.items.find((item) => item.id === first.id).wrong = ["Ik gisteren heb een boek gelezen."];
      return p;
    },
    said: "brought in 1 correction you accepted to Travel",
  });
  ok(seen === "My own wording.", `revise saw: ${seen}`);
  ok(outcome.ok && outcome.said === "brought in 1 correction you accepted to Travel", JSON.stringify(outcome));
  const body = JSON.parse(latest().body);
  // The first sentence as the copy has it (the earlier corrections arrived), with this correction: nothing else.
  ok(body.items.length === 1 && body.items[0].id === first.id && body.items[0].means === "Yesterday I read a book, start to finish." && JSON.stringify(body.items[0].wrong) === '["Ik gisteren heb een boek gelezen."]' && !body.dictionaries, JSON.stringify(body));
  ok(!JSON.stringify(body).includes("My own wording."), "the AI's wording rode along");
  return outcome.said;
});

await test("Codex's review: busy while a change on its way touches the same sentence or word (it may yet be refused or expire)", async () => {
  arrive();
  const ai = await updateItems(env, OWNER, "oauth:Claude", { pack_id: "travel", items: [{ ...authoring(second), natural: "Not arrived yet." }], words: { [lemma]: "a gloss on its way" } });
  ok(ai.ok, JSON.stringify(ai));
  const before = changes();
  const sameSentence = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.items.find((item) => item.id === second.id).wrong = ["Morgen oma ik bel op."];
      return p;
    },
  });
  ok(!sameSentence.ok && sameSentence.reason === "busy" && /the sentence morgen-oma|the sentence/.test(sameSentence.errors[0].message), JSON.stringify(sameSentence));
  const sameWord = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.words[lemma] = "a corrected gloss";
      return p;
    },
  });
  ok(!sameWord.ok && sameWord.reason === "busy" && sameWord.errors[0].message.includes(`words: ${lemma}`), JSON.stringify(sameWord));
  ok(changes() === before, "nothing was queued");
  arrive();
  const later = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.words[lemma] = "a corrected gloss";
      return p;
    },
  });
  ok(later.ok, `once it arrived: ${JSON.stringify(later)}`);
  return sameWord.errors[0].message;
});

await test("Codex's review: what's sent is what the check gives back (a word's entry written with spaces round it)", async () => {
  arrive();
  const outcome = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      const gloss = p.words[lemma];
      delete p.words[lemma];
      p.words[` ${lemma} `] = `${gloss}, again`;
      return p;
    },
  });
  ok(outcome.ok, JSON.stringify(outcome));
  const body = JSON.parse(latest().body);
  ok(body.kind === "edit" && JSON.stringify(Object.keys(body.dictionaries.words)) === JSON.stringify([lemma]) && body.dictionaries.words[lemma].endsWith(", again"), JSON.stringify(body.dictionaries));
  // The author's device ends with what was checked here.
  ok(arrive().words[lemma].endsWith(", again"), "the device's pack");
});

await test("Codex's review: each change is queued as checked, so the pack as it will be is what a device keeps (an entry written with spaces round its word)", async () => {
  arrive();
  const other = Object.keys(pack.words)[1];
  const ai = await editPack(env, OWNER, "oauth:Claude", { pack_id: "travel", words: { [` ${other} `]: "a gloss with spaces round its word" } });
  ok(ai.ok, JSON.stringify(ai));
  let keys = null;
  const outcome = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      keys = Object.keys(p.words);
      return null;
    },
  });
  ok(outcome.reason === "nothing" && keys.includes(other) && !keys.includes(` ${other} `), JSON.stringify(keys));
  ok(arrive().words[other] === "a gloss with spaces round its word", "the device's pack");
});

await test("Codex's second review: an entry on its way written with spaces round its word still makes a correction to that word busy", async () => {
  arrive();
  const ai = await editPack(env, OWNER, "oauth:Claude", { pack_id: "travel", words: { [` ${lemma} `]: "a pending gloss" } });
  ok(ai.ok, JSON.stringify(ai));
  const queued = JSON.parse(latest().body);
  ok(JSON.stringify(Object.keys(queued.dictionaries.words)) === JSON.stringify([lemma]), `queued as checked: ${JSON.stringify(queued.dictionaries)}`);
  const outcome = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.words[lemma] = `${p.words[lemma]} plus a correction`;
      return p;
    },
  });
  ok(!outcome.ok && outcome.reason === "busy", JSON.stringify(outcome));
});

await test("Codex's second review: a change on its way is replayed as it was queued, never checked again against defaults that changed since", async () => {
  arrive();
  // Queued when a default pack had the topic it uses (a library topic since taken away): its devices keep it.
  const item = { ...structuredClone(first), id: "gone-topic", topic: "a-topic-no-pack-has-now" };
  sqlite
    .prepare("INSERT INTO pack_changes (id, user_id, pack_id, kind, body, said, source, created_at, expires_at) VALUES ('chg_oldtopic001', ?, 'travel', 'add', ?, 'added 1 sentence to Travel', 'oauth:Claude', ?, ?)")
    .run(OWNER, JSON.stringify({ kind: "add", items: [item] }), Date.now(), Date.now() + 86_400_000);
  sqlite.prepare("INSERT INTO pack_deliveries (change_seq, user_id, device_id, state) SELECT seq, user_id, ?, 'waiting' FROM pack_changes WHERE id = 'chg_oldtopic001'").run(DEVICE);
  const seen = await getPack(env, OWNER, "travel");
  ok(seen.items.some((i) => i.id === "gone-topic"), `get_pack: ${seen.items.map((i) => i.id)}`);
  sqlite.prepare("DELETE FROM pack_deliveries WHERE change_seq = (SELECT seq FROM pack_changes WHERE id = 'chg_oldtopic001')").run();
  sqlite.prepare("DELETE FROM pack_changes WHERE id = 'chg_oldtopic001'").run();
});

/** A change queued before changes were queued as checked: an entry written with spaces round its word, still on its way. */
function legacyEdit(id, word, gloss) {
  sqlite
    .prepare("INSERT INTO pack_changes (id, user_id, pack_id, kind, body, said, source, created_at, expires_at) VALUES (?, ?, 'travel', 'edit', ?, 'changed the details of Travel', 'oauth:Claude', ?, ?)")
    .run(id, OWNER, JSON.stringify({ kind: "edit", dictionaries: { words: { [` ${word} `]: gloss } } }), Date.now(), Date.now() + 86_400_000);
  sqlite.prepare("INSERT INTO pack_deliveries (change_seq, user_id, device_id, state) SELECT seq, user_id, ?, 'waiting' FROM pack_changes WHERE id = ?").run(DEVICE, id);
}

await test("Codex's third review: a change carries only the entries it asks for (an older raw change on its way never rides along in another)", async () => {
  arrive();
  legacyEdit("chg_legacyraw01", lemma, "an older gloss");
  const renamed = await editPack(env, OWNER, "oauth:Claude", { pack_id: "travel", name: "Trips" });
  ok(renamed.ok, JSON.stringify(renamed));
  const body = JSON.parse(latest().body);
  ok(body.kind === "edit" && body.name === "Trips" && !body.dictionaries, `the rename: ${JSON.stringify(body)}`);
  arrive();
  await editPack(env, OWNER, "oauth:Claude", { pack_id: "travel", name: "Travel" });
});

await test("Codex's third review: an entry asked for goes even when a change on its way already says it (that one may yet be refused)", async () => {
  arrive();
  const other = Object.keys(pack.words)[1];
  const first = await editPack(env, OWNER, "oauth:Claude", { pack_id: "travel", words: { [other]: "the same gloss" } });
  const second = await editPack(env, OWNER, "oauth:Claude", { pack_id: "travel", words: { [other]: "the same gloss" } });
  ok(first.ok && second.ok, JSON.stringify([first, second]));
  const body = JSON.parse(latest().body);
  ok(body.dictionaries?.words?.[other] === "the same gloss", `the second: ${JSON.stringify(body)}`);
});

await test("Codex's third review: an older raw change on its way doesn't make an unrelated correction busy", async () => {
  arrive();
  legacyEdit("chg_legacyraw02", lemma, "an older gloss, again");
  const outcome = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.items.find((item) => item.id === second.id).means = "Unrelated to that word.";
      return p;
    },
  });
  ok(outcome.ok && outcome.items === 1, JSON.stringify(outcome));
  const body = JSON.parse(latest().body);
  ok(body.kind === "update" && !body.dictionaries, JSON.stringify(body));
});

await test("corrections as Explore accepts them (pack-corrections.js withFixes, by path): the author's pack takes exactly those pieces", async () => {
  arrive();
  const fixes = [
    { path: itemPath(second.id, "means"), value: "Tomorrow I'll ring Grandma." },
    { path: wordPath(lemma), value: "yesterday (as accepted)" },
  ];
  const outcome = await queueOwnerChange(env, OWNER, { packId: "travel", revise: (p) => withFixes(p, fixes, { installed: [] }).pack ?? null, said: "brought in 2 corrections you accepted to Travel" });
  ok(outcome.ok && outcome.items === 1, JSON.stringify(outcome));
  const body = JSON.parse(latest().body);
  ok(body.kind === "update" && body.items[0].id === second.id && body.items[0].means === "Tomorrow I'll ring Grandma." && JSON.stringify(body.dictionaries) === JSON.stringify({ words: { [lemma]: "yesterday (as accepted)" } }), JSON.stringify(body));
  const kept = arrive();
  ok(kept.items.find((i) => i.id === second.id).means === "Tomorrow I'll ring Grandma." && kept.words[lemma] === "yesterday (as accepted)", "the author's device keeps them");
  return outcome.said;
});

await test("a pack's readings travel like its other dictionaries (Japanese), queued as checked", async () => {
  const ja = {
    format: "lexicommons-pack", version: 2, id: "check-ja", name: "A check pack (Japanese)", language: "ja", from: "en",
    topics: { home: "At home" }, words: { 私: "I", 学生: "student", です: "is", 食べる: "to eat", 寿司: "sushi" },
    readings: { 私: "わたし", 学生: "がくせい", 食べる: "たべる", 寿司: "すし" }, chunks: {}, patterns: {},
    items: [
      { id: "student", topic: "home", concepts: ["desu"], words: [["私", "私", "わたし"], ["は"], ["学生", "学生", "がくせい"], ["です", "です"]], punct: "。", literal: [["I"], ["a student"], ["am", true]], english: [0, 2, 1], moved: ["です"], means: "I'm a student.", wrong: ["私を学生です。"], gap: { index: 1, options: ["は", "を"] } },
      { id: "sushi", topic: "home", concepts: ["object-o"], words: [["寿司", "寿司", "すし"], ["を"], ["食べました", "食べる", "たべました"]], punct: "。", literal: [["sushi"], ["ate", true]], english: [1, 0], moved: ["食べました"], means: "I ate sushi.", wrong: ["寿司が食べました。"], gap: { index: 1, options: ["を", "が"] } },
    ],
  };
  const { pack: checked, errors } = checkPack(ja, { installed: [] });
  ok(checked, JSON.stringify(errors));
  sqlite.prepare("INSERT INTO pack_copies (user_id, pack_id, language, pack, through, device_id, updated_at) VALUES (?, 'check-ja', 'ja', ?, 0, ?, ?)").run(OWNER, JSON.stringify(checked), DEVICE, Date.now());
  // Your AI drops a reading and puts it back with spaces round its word: queued as the check keeps it.
  const edited = await editPack(env, OWNER, "oauth:Claude", { pack_id: "check-ja", readings: { " 寿司 ": "すし" } });
  ok(edited.ok, JSON.stringify(edited));
  const body = JSON.parse(latest().body);
  ok(JSON.stringify(body.dictionaries) === JSON.stringify({ readings: { 寿司: "すし" } }), `queued: ${JSON.stringify(body.dictionaries)}`);
  sqlite.prepare("UPDATE pack_changes SET body = NULL WHERE user_id = ? AND pack_id = 'check-ja'").run(OWNER);
  // And a correction to a reading reaches the author's pack.
  const outcome = await queueOwnerChange(env, OWNER, {
    packId: "check-ja",
    revise: (p) => {
      p.readings["学生"] = "がくせい";
      p.words["学生"] = "a student";
      return p;
    },
  });
  ok(outcome.ok && JSON.stringify(JSON.parse(latest().body).dictionaries) === JSON.stringify({ words: { 学生: "a student" } }), JSON.stringify({ outcome, body: latest().body }));
});

await test("Codex's fourth review: a correction to a word an older raw change on its way also sets is busy, never folded into nothing", async () => {
  arrive();
  legacyEdit("chg_legacyraw03", lemma, "an older pending gloss");
  const outcome = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.words[lemma] = "the accepted gloss";
      return p;
    },
  });
  ok(!outcome.ok && outcome.reason === "busy" && outcome.errors[0].message.includes(`words: ${lemma}`), JSON.stringify(outcome));
});

await test("refused in words: a sentence added or taken out, the pack's name or language touched, an error inside revise, a correction that fails the check", async () => {
  const before = changes();
  refusedWith(await queueOwnerChange(env, OWNER, { packId: "travel", revise: (p) => ({ ...p, items: p.items.slice(1) }) }), /never add or take out a sentence/);
  refusedWith(await queueOwnerChange(env, OWNER, { packId: "travel", revise: (p) => ({ ...p, items: [...p.items, { ...p.items[0], id: "extra" }] }) }), /never add or take out a sentence/);
  refusedWith(await queueOwnerChange(env, OWNER, { packId: "travel", revise: (p) => ({ ...p, name: "Not yours to rename" }) }), /never its name/);
  refusedWith(await queueOwnerChange(env, OWNER, { packId: "travel", revise: (p) => ({ ...p, language: "de" }) }), /never its language/);
  refusedWith(
    await queueOwnerChange(env, OWNER, {
      packId: "travel",
      revise: () => {
        throw new Error("a fix for a piece that isn't there");
      },
    }),
    /couldn't be applied to the author's pack: a fix for a piece/,
  );
  const failing = refusedWith(
    await queueOwnerChange(env, OWNER, {
      packId: "travel",
      revise: (p) => {
        p.items.find((item) => item.id === first.id).wrong = [];
        return p;
      },
    }),
    /wrong/,
  );
  refusedWith(await queueOwnerChange(env, OWNER, { packId: "../x", revise: fixes }), /packId must be/);
  ok(changes() === before, "nothing was queued");
  return failing;
});

await test("another change to the pack landing meanwhile: refused (look again), never queued over it", async () => {
  arrive();
  // Right after the pack as it will be is read, another of the author's devices queues a change to it.
  faults.between = {
    pattern: /SELECT c\.id, c\.kind, c\.body, c\.said FROM pack_changes c/,
    run: () =>
      sqlite
        .prepare("INSERT INTO pack_changes (id, user_id, pack_id, kind, body, said, source, created_at, expires_at) VALUES ('chg_meanwhile01', ?, 'travel', 'edit', '{\"kind\":\"edit\"}', 'changed the details of Travel', 'device:Author laptop', ?, ?)")
        .run(OWNER, Date.now(), Date.now() + 86_400_000),
  };
  const outcome = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.items.find((item) => item.id === second.id).means = "Meanwhile.";
      return p;
    },
  });
  return refusedWith(outcome, /Another change to this pack arrived at the same moment/);
});

await test("Codex's review: the devices named are the ones it goes to: one registering before the batch is named and gets it; one after isn't named, and gets it anyway", async () => {
  arrive();
  // Registers right after the pack is read (before the change's batch).
  faults.between = { pattern: /SELECT c\.id, c\.kind, c\.body, c\.said FROM pack_changes c/, run: () => putDevice(env, OWNER, "device-author-2", "Author tablet", [], []) };
  const early = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.items.find((item) => item.id === second.id).means = "Named right.";
      return p;
    },
  });
  ok(early.ok && JSON.stringify([...early.devices].sort()) === '["Author phone","Author tablet"]', JSON.stringify(early));
  arrive();
  // Registers right after the change's batch (D1 lets nothing in between its statements).
  faults.between = { pattern: /FROM pack_devices/, run: () => putDevice(env, OWNER, "device-author-3", "Author laptop", [], []) };
  const late = await queueOwnerChange(env, OWNER, {
    packId: "travel",
    revise: (p) => {
      p.items.find((item) => item.id === second.id).means = "Named right, again.";
      return p;
    },
  });
  ok(late.ok && !late.devices.includes("Author laptop"), JSON.stringify(late));
  const waiting = rows("SELECT d.device_id FROM pack_deliveries d JOIN pack_changes c ON c.seq = d.change_seq WHERE c.id = ? ORDER BY d.device_id", late.changeId).map((r) => r.device_id);
  ok(JSON.stringify(waiting) === '["device-author-1","device-author-2","device-author-3"]', `it goes to: ${waiting}`);
  return `named ${late.devices.join(", ")}; the laptop gets it on registering`;
});

await test("Undo (in the app, or the author's AI) takes the corrections back out like any change", async () => {
  const id = latest().id;
  const undone = await undoChange(env, OWNER, "device:Author phone", id);
  ok(undone.ok && latest().kind === "undo" && JSON.parse(latest().body).change === id, JSON.stringify(undone));
});

await test("the relay's furthest change: a device hears it when it says it's here, and no copy may claim to be past it", async () => {
  const latest = await relayLatest(env, OWNER);
  ok(latest > 0 && latest === row("SELECT MAX(seq) AS n FROM pack_changes WHERE user_id = ?", OWNER).n, `latest: ${latest}`);
  const here = await putDevice(env, OWNER, DEVICE, "Author phone", [], []);
  ok(here.latest === latest, `putDevice says ${here.latest}`);
  const pack = JSON.parse(row("SELECT pack FROM pack_copies WHERE user_id = ? AND pack_id = 'travel'", OWNER).pack);
  const before = row("SELECT through FROM pack_copies WHERE user_id = ? AND pack_id = 'travel'", OWNER).through;
  await sendCopy(env, OWNER, DEVICE, "travel", { through: latest + 1_000_000, pack }).then(
    () => ok(false, "a copy past it was kept"),
    (error) => ok(/past the last change/.test(error.message), error.message),
  );
  await deleteCopy(env, OWNER, DEVICE, "travel", latest + 1_000_000).then(
    () => ok(false, "a delete past it was kept"),
    (error) => ok(/past the last change/.test(error.message), error.message),
  );
  ok(row("SELECT through FROM pack_copies WHERE user_id = ? AND pack_id = 'travel'", OWNER).through === before, "the copy is as it was");
  await sendCopy(env, OWNER, DEVICE, "travel", { through: latest, pack });
  ok(row("SELECT through FROM pack_copies WHERE user_id = ? AND pack_id = 'travel'", OWNER).through === latest, "one at it is kept");
  // Once the changes have gone from history, the furthest copy still says how far the relay got.
  sqlite.prepare("DELETE FROM pack_changes WHERE user_id = ?").run(OWNER);
  ok((await relayLatest(env, OWNER)) === latest, "still known from the copies");
});

/** An item in the form your AI writes (as get_pack gives it). */
// ---------- your AI's recordings for a pack of yours ----------

const CLIPS = join(APP, "public/audio/starter-word-order/emma");
const mp3 = (name) => new Uint8Array(readFileSync(join(CLIPS, name)));
const MP3S = ["boek-gelezen.mp3", "morgen-oma.mp3", "denk-regent.mp3", "hoe-gaat.mp3", "bel-op.mp3"].map(mp3);
const nameOf = (bytes) => `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.mp3`;
const SOUNDS = checkPack({ ...structuredClone(pack), id: "sounds", name: "Sounds" }, { installed: [pack] }).pack;
const [s1, s2, s3] = SOUNDS.items;
const word = Object.keys(SOUNDS.words)[0];
const timings = (item) => item.words.map((_, n) => [n * 0.3, n * 0.3 + 0.2]);
let recordings = 0;
async function recording(bytes, { at = Date.now(), purpose = "pack-audio:mp3", type = "audio/mpeg", user = OWNER } = {}) {
  const id = `uprec${String(++recordings).padStart(6, "0")}`;
  await env.UPLOADS.put(uploadKey(user, id), bytes);
  sqlite
    .prepare("INSERT INTO uploads (id, user_id, filename, content_type, status, size, r2_key, source, created_at, expires_at, stored_at, purpose) VALUES (?, ?, 'clip.mp3', ?, 'stored', ?, ?, 'oauth:Claude', ?, ?, ?, ?)")
    .run(id, user, type, bytes.byteLength, uploadKey(user, id), at, at + 900_000, at, purpose);
  return id;
}
const purposeOf = (id) => row("SELECT purpose FROM uploads WHERE id = ?", id)?.purpose ?? null;
const sentence = (item, upload_id) => ({ upload_id, seconds: 2, words: timings(item) });
/** A fresh start for the pack: no changes on their way, no recordings, its copy as the device sent it. */
function freshSounds() {
  sqlite.prepare("UPDATE pack_deliveries SET state = 'applied', settled_at = ? WHERE user_id = ? AND state = 'waiting'").run(Date.now(), OWNER);
  sqlite.prepare("UPDATE pack_changes SET body = NULL WHERE user_id = ?").run(OWNER);
  sqlite.prepare("DELETE FROM pack_audio WHERE user_id = ?").run(OWNER);
  sqlite.prepare("DELETE FROM uploads WHERE user_id = ?").run(OWNER);
  const through = row("SELECT COALESCE(MAX(seq), 0) AS n FROM pack_changes").n;
  sqlite
    .prepare("INSERT INTO pack_copies (user_id, pack_id, language, pack, through, device_id, updated_at) VALUES (?, 'sounds', 'nl', ?, ?, ?, ?) ON CONFLICT (user_id, pack_id) DO UPDATE SET pack = excluded.pack, through = excluded.through")
    .run(OWNER, JSON.stringify(SOUNDS), through, DEVICE, Date.now());
  return through;
}
const refusedSet = async (input, pattern) => {
  const error = await setPackAudio(env, OWNER, "oauth:Claude", input).then(
    () => null,
    (e) => e,
  );
  ok(error && pattern.test(error.message), `not refused with ${pattern}: ${error?.message ?? "it passed"}`);
  return error.message;
};

await test("your AI's recordings: each clip checked and named by its bytes, the same bytes once, queued to your devices as its change's files", async () => {
  freshSounds();
  const [a, b, again] = [await recording(MP3S[0]), await recording(MP3S[1]), await recording(MP3S[0])];
  const set = await setPackAudio(env, OWNER, "oauth:Claude", {
    pack_id: "sounds",
    voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, a), [s2.id]: sentence(s2, again) }, words: { [word]: { upload_id: b, seconds: 0.8 } } } },
  });
  eq(set.said, "recorded 2 sentences and 1 word of Sounds");
  eq([set.clips, set.devices.sort()], [2, rows("SELECT label FROM pack_devices WHERE user_id = ?", OWNER).map((d) => d.label).sort()]);
  eq(set.recordings, [{ voice: "emma", name: "Emma", sentences: 2, words: 1 }]);
  const change = latest();
  const body = JSON.parse(change.body);
  eq([change.id, change.kind, change.source], [set.change_id, "audio", "oauth:Claude"]);
  eq(body.clips.sort(), [nameOf(MP3S[0]), nameOf(MP3S[1])].sort());
  eq(body.voices.emma.items[s2.id].clip, nameOf(MP3S[0]));
  eq(body.voices.emma.words[word].clip, nameOf(MP3S[1]));
  // Its files: one upload per clip, marked as the change's and named by the clip; the duplicate's row and bytes gone.
  const files = rows("SELECT id, filename FROM uploads WHERE user_id = ? AND purpose = ? ORDER BY filename", OWNER, `pack-audio-in:${set.change_id}`);
  eq(files.map((f) => f.filename).sort(), body.clips.sort());
  const gone = [a, again].find((id) => !files.some((f) => f.id === id));
  ok(gone && !purposeOf(gone) && !env.UPLOADS.objects.has(uploadKey(OWNER, gone)), "the second upload of the same bytes is gone");
  // get_pack lists them, before any device has them.
  eq((await getPack(env, OWNER, "sounds")).recordings, [{ voice: "emma", name: "Emma", sentences: 2, words: 1 }]);
});

await test("a clip is served to your devices only while its change is on its way; then it's gone from the server", async () => {
  const change = latest();
  const clip = nameOf(MP3S[1]);
  const served = await serveChangeClip(env, OWNER, change.id, clip);
  eq(served.status, 200);
  eq(new Uint8Array(await served.arrayBuffer()), MP3S[1]);
  eq([served.headers.get("Content-Type"), served.headers.get("X-Content-Type-Options"), served.headers.get("Cache-Control")], ["audio/mpeg", "nosniff", "private, no-store"]);
  ok(/sandbox/.test(served.headers.get("Content-Security-Policy") ?? ""), "served so it can't run as a page");
  for (const [user, id, name] of [
    ["someone-else", change.id, clip],
    [OWNER, change.id, nameOf(MP3S[2])],
    [OWNER, change.id, "../x.mp3"],
    [OWNER, "chg_nope", clip],
  ]) {
    eq((await serveChangeClip(env, user, id, name)).status, 404);
  }
  // Every device it went to: still served while any has yet to report, gone once the last has.
  const devices = rows("SELECT device_id FROM pack_deliveries WHERE change_seq = (SELECT seq FROM pack_changes WHERE id = ?)", change.id).map((d) => d.device_id);
  ok(devices.length > 1, `${devices.length} devices`);
  for (const [n, device] of devices.entries()) {
    eq((await serveChangeClip(env, OWNER, change.id, clip)).status, 200);
    // The last report's delete fails for a moment: the files are still there, but it's never served again.
    faults.deletes = n === devices.length - 1;
    await report(env, OWNER, device, change.id, { state: n % 2 ? "missing" : "applied" });
  }
  ok(rows("SELECT id FROM uploads WHERE purpose = ?", `pack-audio-in:${change.id}`).length, "the files outlived the failed delete");
  eq((await serveChangeClip(env, OWNER, change.id, clip)).status, 404);
  faults.deletes = false;
  await listChanges(env, OWNER);
  eq(rows("SELECT id FROM uploads WHERE purpose = ?", `pack-audio-in:${change.id}`), []);
  ok(![...env.UPLOADS.objects.keys()].some((key) => key.startsWith(uploadKey(OWNER, ""))), "no recording's bytes left");
});

await test("a report from a device the change never went to (or one sent twice) never takes its content or its clips", async () => {
  freshSounds();
  const clip = await recording(MP3S[3]);
  sqlite.prepare("UPDATE pack_devices SET seen_at = 0 WHERE user_id = ?").run(OWNER);
  try {
    // No device to go to: nothing waiting, and a report from anyone changes nothing.
    const set = await setPackAudio(env, OWNER, "oauth:Claude", { pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, clip) } } } });
    eq(set.devices, []);
    await report(env, OWNER, "device-never-had-it", set.change_id, { state: "applied" });
    await report(env, OWNER, DEVICE, set.change_id, { state: "applied" });
    ok(row("SELECT body FROM pack_changes WHERE id = ?", set.change_id).body, "its content is still there");
    eq((await serveChangeClip(env, OWNER, set.change_id, nameOf(MP3S[3]))).status, 200);
  } finally {
    sqlite.prepare("UPDATE pack_devices SET seen_at = ? WHERE user_id = ?").run(Date.now(), OWNER);
  }
});

await test("refused in words, every problem with nothing kept: each recording goes back to waiting for a set_pack_audio", async () => {
  freshSounds();
  const good = await recording(MP3S[2]);
  const text = await recording(new TextEncoder().encode("ID3 not really an mp3, just words dressed up as one ".repeat(40)));
  const before = changes();
  await refusedSet({ pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, good), [s2.id]: sentence(s2, text) } } } }, /isn't an MP3/);
  await refusedSet({ pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: { ...sentence(s1, good), words: [[0, 1]] } } } } }, /each of the sentence's \d+ words/);
  await refusedSet({ pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { "not-there": sentence(s1, good) } } } }, /no sentence "not-there"/);
  await refusedSet({ pack_id: "sounds", voices: { emma: { name: "Emma", items: { [s1.id]: sentence(s1, good) } } } }, /locale/);
  await refusedSet({ pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, "upnothere00") } } } }, /No recording upnothere00 waiting/);
  await refusedSet({ pack_id: "nope", voices: { emma: null } }, /./);
  await refusedSet({ pack_id: "sounds", voices: { emma: null } }, /has no recordings to change/);
  // Someone else's recording is never theirs to use.
  sqlite.prepare("INSERT OR IGNORE INTO users (id, name, created_at) VALUES ('someone-else', 'Someone', ?)").run(Date.now());
  const theirs = await recording(MP3S[3], { user: "someone-else" });
  await refusedSet({ pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, theirs) } } } }, /No recording/);
  eq([purposeOf(good), purposeOf(text), purposeOf(theirs)], ["pack-audio:mp3", "pack-audio:mp3", "pack-audio:mp3"]);
  eq(changes(), before);
  // Too many at once, and more than an account keeps on its way: refused, nothing kept.
  const limits = { ...PACK_RELAY };
  try {
    PACK_RELAY.clipsPerChange = 1;
    const other = await recording(MP3S[3]);
    await refusedSet({ pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, good), [s2.id]: sentence(s2, other) } } } }, /up to 1 at a time/);
    PACK_RELAY.clipsPerChange = limits.clipsPerChange;
    PACK_RELAY.audioInTransit = MP3S[2].byteLength + MP3S[3].byteLength - 1;
    await refusedSet({ pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, good), [s2.id]: sentence(s2, other) } } } }, /more recordings on their way/);
    eq([purposeOf(good), purposeOf(other)], ["pack-audio:mp3", "pack-audio:mp3"]);
    // One on its way counts against the next.
    PACK_RELAY.audioInTransit = MP3S[2].byteLength + MP3S[3].byteLength;
    await setPackAudio(env, OWNER, "oauth:Claude", { pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, good) } } } });
    const third = await recording(MP3S[4]);
    await refusedSet({ pack_id: "sounds", voices: { emma: { items: { [s2.id]: sentence(s2, other), [s3.id]: sentence(s3, third) } } } }, /more recordings on their way/);
    eq([purposeOf(other), purposeOf(third)], ["pack-audio:mp3", "pack-audio:mp3"]);
  } finally {
    Object.assign(PACK_RELAY, limits);
  }
  eq(changes(), before + 1);
});

await test("merged into the recordings as they will be: what's on its way, a sentence taken away, a voice beside it, a sentence whose words change", async () => {
  freshSounds();
  const [a, b, c] = [await recording(MP3S[0]), await recording(MP3S[1]), await recording(MP3S[2])];
  await setPackAudio(env, OWNER, "oauth:Claude", { pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, a), [s2.id]: sentence(s2, b) } } } });
  // The next one adds a voice and takes a sentence's recording away: only that travels.
  const next = await setPackAudio(env, OWNER, "oauth:Claude", { pack_id: "sounds", voices: { emma: { items: { [s2.id]: null } }, anna: { name: "Anna", locale: "nl-NL", items: { [s3.id]: sentence(s3, c) } } } });
  eq(next.said, "recorded 1 sentence of Sounds");
  eq(JSON.parse(latest().body).voices, { emma: { items: { [s2.id]: null }, words: {} }, anna: { name: "Anna", locale: "nl-NL", items: { [s3.id]: { clip: nameOf(MP3S[2]), seconds: 2, words: timings(s3) } }, words: {} } });
  eq((await getPack(env, OWNER, "sounds")).recordings, [
    { voice: "emma", name: "Emma", sentences: 1, words: 0 },
    { voice: "anna", name: "Anna", sentences: 1, words: 0 },
  ]);
  // Only the English changes: the recordings stay. Its words change: that sentence's go.
  const english = await updateItems(env, OWNER, "oauth:Claude", { pack_id: "sounds", items: [{ ...authoring(s1), natural: "Other English." }] });
  ok(english.ok, JSON.stringify(english));
  eq((await getPack(env, OWNER, "sounds")).recordings.map((r) => r.sentences), [1, 1]);
  const removed = await removeItems(env, OWNER, "oauth:Claude", { pack_id: "sounds", ids: [s3.id] });
  ok(removed.ok, JSON.stringify(removed));
  eq((await getPack(env, OWNER, "sounds")).recordings, [{ voice: "emma", name: "Emma", sentences: 1, words: 0 }]);
  // Taking a voice away that isn't there changes nothing it has; remove_pack_audio takes them all.
  const all = await removePackAudio(env, OWNER, "oauth:Claude", { pack_id: "sounds" });
  eq([all.said, JSON.parse(latest().body)], ["took the recordings away from Sounds", { kind: "audio", voices: null, clips: [] }]);
  eq((await getPack(env, OWNER, "sounds")).recordings, []);
  const error = await removePackAudio(env, OWNER, "oauth:Claude", { pack_id: "sounds" }).then(
    () => null,
    (e) => e,
  );
  ok(/no recordings to take away/.test(error?.message), error?.message);
  // Undo of a recording change goes through the relay like any other.
  const undone = await undoChange(env, OWNER, "oauth:Claude", all.change_id);
  ok(undone.ok, JSON.stringify(undone));
});

await test("a device's copy carries the pack's recordings up to the change it went to, in its batch: newer wins, none clears, an older app's copy or too many keep none, a malformed one is refused", async () => {
  const through = freshSounds();
  const audio = checkAudio(
    { format: "lexicommons-audio", version: 2, pack: "sounds", language: "nl", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: { clip: nameOf(MP3S[0]), seconds: 2, words: timings(s1) } }, words: {} } } },
    SOUNDS,
  ).audio;
  ok(audio, "a manifest");
  const stored = () => row("SELECT manifest, through FROM pack_audio WHERE user_id = ? AND pack_id = 'sounds'", OWNER);
  await sendCopy(env, OWNER, DEVICE, "sounds", { through, pack: SOUNDS, audio });
  eq([JSON.parse(stored().manifest), stored().through], [audio, through]);
  eq((await getPack(env, OWNER, "sounds")).recordings, [{ voice: "emma", name: "Emma", sentences: 1, words: 0 }]);
  // In the account's export, beside its pack.
  eq((await (await import(join(APP, "src/packs.ts"))).exportPacks(env, OWNER)).copies.find((c) => c.pack.id === "sounds").recordings, audio);
  // Recordings that don't fit the pack: refused in words, and nothing changes.
  const wrong = await sendCopy(env, OWNER, DEVICE, "sounds", { through, pack: SOUNDS, audio: { ...audio, pack: "other" } }).then(
    () => null,
    (e) => e,
  );
  ok(/recordings don't fit the pack/.test(wrong?.message), wrong?.message);
  eq(JSON.parse(stored().manifest), audio);
  // An older app's copy (no recordings sent): what they read can't be known, so none is kept. None clears them too.
  await sendCopy(env, OWNER, DEVICE, "sounds", { through, pack: SOUNDS });
  eq(stored(), null);
  await sendCopy(env, OWNER, DEVICE, "sounds", { through, pack: SOUNDS, audio });
  await sendCopy(env, OWNER, DEVICE, "sounds", { through, pack: SOUNDS, audio: null });
  eq(stored(), null);
  // Too many to keep: none kept, and the device is told.
  const limit = PACK_RELAY.audioManifest;
  try {
    PACK_RELAY.audioManifest = 100;
    const big = await sendCopy(env, OWNER, DEVICE, "sounds", { through, pack: SOUNDS, audio });
    ok(/too many to keep/.test(big.recordings) && !stored(), JSON.stringify(big));
  } finally {
    PACK_RELAY.audioManifest = limit;
  }
  // Two copies at once: one going further lands between the other's copy and its recordings. The further one's stay.
  const further = { ...audio, voices: { anna: { ...audio.voices.emma, name: "Anna" } } };
  faults.between = {
    pattern: /SELECT COUNT\(\*\) AS n FROM pack_copies/,
    run: () => {
      sqlite.prepare("UPDATE pack_copies SET through = ? WHERE user_id = ? AND pack_id = 'sounds'").run(through + 5, OWNER);
      sqlite.prepare("INSERT OR REPLACE INTO pack_audio (user_id, pack_id, manifest, through, updated_at) VALUES (?, 'sounds', ?, ?, ?)").run(OWNER, JSON.stringify(further), through + 5, Date.now());
    },
  };
  await sendCopy(env, OWNER, DEVICE, "sounds", { through, pack: SOUNDS, audio });
  eq([JSON.parse(stored().manifest).voices.anna?.name, stored().through], ["Anna", through + 5]);
  sqlite.prepare("UPDATE pack_copies SET through = ? WHERE user_id = ? AND pack_id = 'sounds'").run(through, OWNER);
  sqlite.prepare("DELETE FROM pack_audio WHERE user_id = ?").run(OWNER);
  // A removal from a change before the copy's (arriving late) changes neither the copy nor its recordings.
  sqlite.prepare("INSERT INTO pack_changes (id, user_id, pack_id, kind, body, said, source, created_at, expires_at) VALUES ('chg_audiolater1', ?, 'sounds', 'edit', NULL, 'renamed', 'device:x', ?, ?)").run(OWNER, Date.now(), Date.now() + 1000);
  const later = await relayLatest(env, OWNER);
  await sendCopy(env, OWNER, DEVICE, "sounds", { through: later, pack: SOUNDS, audio });
  await deleteCopy(env, OWNER, DEVICE, "sounds", through);
  eq([stored()?.through, row("SELECT through, pack IS NULL AS gone FROM pack_copies WHERE user_id = ? AND pack_id = 'sounds'", OWNER)], [later, { through: later, gone: 0 }]);
  // Even recordings kept from before the copy (a row from before they were written together) stay with the copy kept.
  sqlite.prepare("UPDATE pack_audio SET through = ? WHERE user_id = ?").run(through, OWNER);
  await deleteCopy(env, OWNER, DEVICE, "sounds", through);
  ok(stored(), "the late removal didn't take them");
  sqlite.prepare("UPDATE pack_copies SET through = ? WHERE user_id = ? AND pack_id = 'sounds'").run(through, OWNER);
  sqlite.prepare("DELETE FROM pack_audio WHERE user_id = ?").run(OWNER);
  // The pack going (its copy deleted) takes them too.
  await sendCopy(env, OWNER, DEVICE, "sounds", { through, pack: SOUNDS, audio });
  sqlite.prepare("INSERT INTO pack_changes (id, user_id, pack_id, kind, body, said, source, created_at, expires_at) VALUES ('chg_audiodelete1', ?, 'sounds', 'delete', NULL, 'deleted', 'device:x', ?, ?)").run(OWNER, Date.now(), Date.now() + 1000);
  await deleteCopy(env, OWNER, DEVICE, "sounds", await relayLatest(env, OWNER));
  eq(stored(), null);
});

await test("tidying: a recording no set_pack_audio used goes a day on, a claim never finished an hour on, a change's files when it's done; never one being claimed", async () => {
  freshSounds();
  const DAY = 86_400_000;
  const now = Date.now();
  const fresh = await recording(MP3S[0]);
  const stale = await recording(MP3S[1], { at: now - DAY - 60_000 });
  const claiming = await recording(MP3S[2], { at: now - 3 * DAY, purpose: `pack-audio-claim:${now - 60_000}:aaaa` });
  const abandoned = await recording(MP3S[3], { at: now - 3 * DAY, purpose: `pack-audio-claim:${now - 2 * 3_600_000}:bbbb` });
  const orphan = await recording(MP3S[4], { at: now - 2 * DAY, purpose: "pack-audio-in:chg_longgone000" });
  const racing = await recording(MP3S[0], { at: now - 2 * DAY });
  // A set_pack_audio claims one of the stale ones just after tidying read it: it stays.
  faults.between = {
    pattern: /pack-audio-going' OR/,
    run: () => sqlite.prepare("UPDATE uploads SET purpose = ? WHERE id = ?").run(`pack-audio-claim:${now}:cccc`, racing),
  };
  await listChanges(env, OWNER);
  const left = new Set(rows("SELECT id FROM uploads WHERE user_id = ?", OWNER).map((r) => r.id));
  eq([fresh, stale, claiming, abandoned, orphan, racing].map((id) => left.has(id)), [true, false, true, false, false, true]);
  for (const id of [stale, abandoned, orphan]) ok(!env.UPLOADS.objects.has(uploadKey(OWNER, id)), `${id}'s bytes are gone`);
  ok(env.UPLOADS.objects.has(uploadKey(OWNER, racing)), "the one being claimed keeps its bytes");
  // A delete that fails partway is found again next time.
  const later = await recording(MP3S[1], { at: now - DAY - 60_000 });
  faults.deletes = true;
  await listChanges(env, OWNER);
  eq(purposeOf(later), "pack-audio-going");
  faults.deletes = false;
  await listChanges(env, OWNER);
  eq(purposeOf(later), null);
  // A change past its 7 days takes its files.
  const kept = await recording(MP3S[2]);
  const set = await setPackAudio(env, OWNER, "oauth:Claude", { pack_id: "sounds", voices: { emma: { name: "Emma", locale: "nl-NL", items: { [s1.id]: sentence(s1, kept) } } } });
  sqlite.prepare("UPDATE pack_changes SET expires_at = ? WHERE id = ?").run(now - 1, set.change_id);
  await listChanges(env, OWNER);
  eq([purposeOf(kept), env.UPLOADS.objects.has(uploadKey(OWNER, kept))], [null, false]);
});


/** env whose D1 counts its round trips, as D1's queue does: a statement run on its own is one, a batch is one (7 Nov 2026, the load rehearsal). */
function counting() {
  const n = { trips: 0 };
  const wrap = (st) => ({ inner: st, bind: (...a) => wrap(st.bind(...a)), first: (...a) => (n.trips++, st.first(...a)), all: (...a) => (n.trips++, st.all(...a)), run: (...a) => (n.trips++, st.run(...a)), raw: (...a) => (n.trips++, st.raw(...a)) });
  return { n, env: { ...env, DB: { prepare: (sql) => wrap(env.DB.prepare(sql)), batch: (list) => (n.trips++, env.DB.batch(list.map((st) => st.inner ?? st))) } } };
}

await test("a device saying it's here: 2 round trips with nothing to tidy; each piece of the pack relay's housekeeping, alone, still done", async () => {
  const USER = "user-tidy-check";
  const HERE = "device-tidy-1";
  const now = Date.now();
  const DAY = 86_400_000;
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(USER, "Tidy", now - 200 * DAY);
  sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, ?, 'Tidy phone', '[]', ?, ?)").run(USER, HERE, now, now);
  /** The device says it's here with nothing to tidy: the read and the write, nothing else. */
  const idle = async (what) => {
    const c = counting();
    const answer = await putDevice(c.env, USER, HERE, "Tidy phone", [], []);
    eq([what, c.n.trips, answer.added], [what, 2, false]);
  };
  await idle("a known device");
  const c = counting();
  eq((await putDevice(c.env, USER, "device-tidy-new", "New phone", [], [])).added, true);
  eq(["a new device", c.n.trips], ["a new device", 2]);
  sqlite.prepare("DELETE FROM pack_devices WHERE device_id = 'device-tidy-new'").run();
  await idle("after a new device");
  let changes = 0;
  const change = ({ body = "{}", created = now, expires = now + PACK_RELAY.keep, state = "waiting" } = {}) => {
    const id = `chg_tidycheck${String(++changes).padStart(2, "0")}`;
    sqlite.prepare("INSERT INTO pack_changes (id, user_id, pack_id, kind, body, said, source, created_at, expires_at) VALUES (?, ?, 'tidy-pack', 'update', ?, 'updated', 'pat:check', ?, ?)").run(id, USER, body, created, expires);
    const seq = row("SELECT seq FROM pack_changes WHERE id = ?", id).seq;
    sqlite.prepare("INSERT INTO pack_deliveries (change_seq, user_id, device_id, state) VALUES (?, ?, ?, ?)").run(seq, USER, HERE, state);
    return { id, seq };
  };
  const said = async () => putDevice(env, USER, HERE, "Tidy phone", [], []);
  // A change past its 7 days, still holding its content: the content goes, the delivery expires.
  const a = change({ expires: now - 1 });
  await said();
  eq([row("SELECT body FROM pack_changes WHERE id = ?", a.id).body, row("SELECT state FROM pack_deliveries WHERE change_seq = ?", a.seq).state], [null, "expired"]);
  await idle("after the expired change");
  // A delivery still waiting for an expired change whose content already went: it expires.
  const b = change({ body: null, expires: now - 1 });
  await said();
  eq(row("SELECT state FROM pack_deliveries WHERE change_seq = ?", b.seq).state, "expired");
  await idle("after the waiting delivery");
  // A change past its 90 days: it and its deliveries are forgotten.
  const old = change({ body: null, created: now - PACK_RELAY.history - DAY, expires: now - PACK_RELAY.history, state: "applied" });
  await said();
  eq([row("SELECT 1 AS y FROM pack_changes WHERE id = ?", old.id) ?? null, row("SELECT 1 AS y FROM pack_deliveries WHERE change_seq = ?", old.seq) ?? null], [null, null]);
  await idle("after the old change");
  // A recording no set_pack_audio used, a day on; one for a change no longer on its way.
  const unused = await recording(MP3S[1], { at: now - DAY - 60_000, user: USER });
  await said();
  eq(purposeOf(unused), null);
  await idle("after the unused recording");
  const orphan = await recording(MP3S[2], { purpose: "pack-audio-in:chg_tidygone0001", user: USER });
  await said();
  eq(purposeOf(orphan), null);
  await idle("after the orphan");
  // A device not seen for 30 days: forgotten.
  sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, 'device-tidy-gone', 'Old phone', '[]', ?, ?)").run(USER, now - 60 * DAY, now - PACK_RELAY.deviceGone - 60_000);
  await said();
  eq(row("SELECT 1 AS y FROM pack_devices WHERE device_id = 'device-tidy-gone'") ?? null, null);
  await idle("after the gone device");
  // A claim never finished, an hour on, goes; one being claimed stays (and keeps the tidy looking until it's done or an hour old).
  const abandoned = await recording(MP3S[3], { at: now - 3 * DAY, purpose: `pack-audio-claim:${now - 2 * 3_600_000}:dddd`, user: USER });
  const claiming = await recording(MP3S[4], { at: now - 3 * DAY, purpose: `pack-audio-claim:${now - 60_000}:eeee`, user: USER });
  await said();
  eq([purposeOf(abandoned), purposeOf(claiming)?.startsWith("pack-audio-claim:")], [null, true]);
  return "each one done by the device saying it's here; 2 round trips between";
});

/** Your AI's pack tools as it calls them (mcp-packs.ts): each argument through its tool's own schema, then the tool. */
async function packTools() {
  const tools = {};
  const { registerPackTools } = await import(join(APP, "src/mcp-packs.ts"));
  registerPackTools({ registerTool: (name, config, run) => (tools[name] = { config, run }) }, env, {
    caller: () => ({ userId: OWNER, clientName: "Claude" }),
    sourceLabel: () => "oauth:Claude",
    ok: (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] }),
    guarded: (run) => run(),
  });
  return async (name, args) => {
    const { config, run } = tools[name];
    const parsed = config.inputSchema.safeParse(args);
    ok(parsed.success, `${name}'s schema refused it: ${JSON.stringify(parsed.error?.issues ?? []).slice(0, 300)}`);
    const result = await run(parsed.data);
    ok(!result.isError, `${name}: ${result.content[0].text.slice(0, 400)}`);
    return JSON.parse(result.content[0].text);
  };
}
/** A pack of the author's in that language: its starter's first three sentences, checked. */
function starterPack(language, id) {
  // Its lessons (and their units) name the starter's other sentences, so a pack of three has none.
  const { lessons, units, ...source } = JSON.parse(readFileSync(join(APP, `packs/starter-${language}.json`), "utf8"));
  const items = source.items.slice(0, 3);
  const words = Object.fromEntries(Object.entries(source.words ?? {}).filter(([lemma]) => items.some((item) => item.words.some(([, l]) => l === lemma))));
  const { pack, errors } = checkPack({ ...structuredClone(source), id, name: `Mine (${language})`, words, items: structuredClone(items) }, { installed: [] });
  if (!pack) throw new Error(`the ${language} test pack doesn't pass: ${JSON.stringify(errors).slice(0, 300)}`);
  return pack;
}

await test("your AI's tools as it calls them, each argument through its tool's own schema: a word to learn and then a phrase's (te laat's te, om te gaan's), added, read with get_pack and sent back with update_items, keeps each time as it was", async () => {
  const call = await packTools();
  putCopy({ ...travel(), id: "phrases", name: "Phrases" });
  const sentence = { id: "te-laat", sentence: "Het is te laat om te gaan.", lemmas: { te: ["te", null], laat: "laat", gaan: "gaan" }, literal: ["It", "is", "too", "late", "for", "to", "go"], english: null, natural: "It's too late to go.", wrong: ["Het is te laat om gaan te."], gap: { word: "laat", options: ["laat", "vroeg"] }, patterns: ["v2"] };
  await call("add_items", { pack_id: "phrases", items: [sentence], words: { te: "too", laat: "late" } });
  const wordsOf = (copy) => copy.items.find((item) => item.id === "te-laat")?.words;
  const added = wordsOf(arrive("phrases"));
  eq(added?.filter(([word]) => word === "te"), [["te", "te"], ["te"]]);
  const shown = (await call("get_pack", { pack_id: "phrases" })).items.find((item) => item.id === "te-laat");
  eq(shown.lemmas.te, ["te", null]);
  await call("update_items", { pack_id: "phrases", items: [{ ...shown, natural: "It is too late to go." }] });
  const copy = arrive("phrases");
  eq(wordsOf(copy), added);
  eq(copy.items.find((item) => item.id === "te-laat").means, "It is too late to go.");
  return "add_items, get_pack and update_items through their schemas; te's two times kept";
});

await test("your AI's tools as it calls them, in Russian and Japanese: a word written twice and said two ways (до́ма then дома́; 方 かた then ほう), added, read with get_pack and sent back with update_items, keeps each time's reading", async () => {
  const call = await packTools();
  const bareOf = (word) => word.replace(/[,.。]$/u, "");
  const cases = [
    ["ru", "дома", ["до́ма", "дома́"], {
      id: "ru-doma", sentence: "Мы дома, а дома вокруг старые.", lemmas: { Мы: "мы", дома: ["дома", "дом"], вокруг: "вокруг", старые: "старый" },
      readings: { дома: ["до́ма", "дома́"], вокруг: "вокру́г", старые: "ста́рые" }, literal: ["We", "at home,", "and", "houses", "around", "old"], english: null,
      natural: "We're at home, and the houses around us are old.", wrong: ["Мы дома, а дома вокруг старый."], gap: { word: "старые", options: ["старые", "старый", "старая"] }, patterns: ["plural"],
    }],
    ["ja", "方", ["かた", "ほう"], {
      id: "ja-kata-hou", sentence: "あの方の方が上手です。", words: ["あの", "方", "の", "方", "が", "上手", "です"], lemmas: { あの: "あの", 方: "方", の: "の", が: "が", 上手: "上手", です: "です" },
      readings: { 方: ["かた", "ほう"], 上手: "じょうず" }, literal: ["That person's", "side", "skilled", "is"], english: null,
      natural: "That person is better at it.", wrong: ["あの方の方を上手です。"], gap: { word: "が", options: ["が", "を"] }, patterns: ["possessive-no", "subject-ga"],
    }],
  ];
  for (const [language, word, readings, sentence] of cases) {
    const id = `readings-${language}`;
    putCopy(starterPack(language, id));
    await call("add_items", { pack_id: id, items: [sentence] });
    const wordsOf = (copy) => copy.items.find((item) => item.id === sentence.id)?.words;
    const added = wordsOf(arrive(id));
    eq(added?.filter(([w]) => bareOf(w) === word).map(([, , reading]) => reading), readings);
    const shown = (await call("get_pack", { pack_id: id })).items.find((item) => item.id === sentence.id);
    eq(shown.readings[word], readings);
    await call("update_items", { pack_id: id, items: [{ ...shown, natural: `${sentence.natural} Really.` }] });
    const copy = arrive(id);
    eq(wordsOf(copy), added);
    eq(copy.items.find((item) => item.id === sentence.id).means, `${sentence.natural} Really.`);
  }
  return "Russian and Japanese through add_items, get_pack and update_items; each time's reading kept";
});

function authoring(item) {
  const words = item.words.map(([text]) => text);
  const lemmas = Object.fromEntries(item.words.filter(([, l]) => l).map(([text, l]) => [text.replace(/[.,!?]+$/, ""), l]));
  return {
    id: item.id,
    sentence: words.join(" ") + (item.punct ?? ""),
    lemmas,
    literal: item.literal.map(([text, moved]) => (moved ? `*${text}*` : text)),
    english: item.english ?? null,
    ...(item.moved?.length ? { moved: item.moved } : {}),
    natural: item.means,
    wrong: item.wrong,
    gap: { word: words[item.gap.index], options: item.gap.options },
    ...(item.topic ? { topic: item.topic } : {}),
    patterns: item.concepts,
    ...(item.chunks?.length ? { chunks: item.chunks } : {}),
  };
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
