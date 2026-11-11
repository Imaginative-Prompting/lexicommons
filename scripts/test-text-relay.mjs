// The text relay's server side (src/texts.ts) on the real migrations in SQLite, with uploads in memory and reads that
// can be made to fail: add_text keeping a change once it's queued, whatever fails after; nothing left behind when it
// fails before; an EPUB keeping its own title; Undo of a remove only while the devices keep it; get_text saying a
// change expired; one upload never going into two texts; the tidy finding every file left behind, and never failing a
// device saying it's here when storage is down. Runs in Node:
// `node scripts/test-text-relay.mjs` (exit 0 = pass). The Worker's TypeScript is loaded through Node's own transform.

import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, faults, row, rows, reset } = workerEnv();
const { addText, getText, removeText, tidy, undoTextChange, TEXT_RELAY, reportText, serveTextFile } = await import(join(APP, "src/texts.ts"));
const { putDevice } = await import(join(APP, "src/packs.ts"));
const { uploadKey } = await import(join(APP, "src/library.ts"));
const { makeEpub } = await import("./fixtures/make-epub.mjs");
const objects = env.UPLOADS.objects;

// ---------- an account, a device, uploads ----------

const USER = "user-check";
const DEVICE = "device-check-1";
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(USER, "Check", Date.now());
sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, ?, 'Check device', '[]', ?, ?)").run(USER, DEVICE, Date.now(), Date.now());

let uploads = 0;
const utf8 = (text) => new TextEncoder().encode(text);
const TYPES = { "text:text": "text/plain", "text:book": "application/json", "text:epub": "application/epub+zip", "text:cover": "image/svg+xml" };
/** An upload of the account's that has arrived (or only been asked for, with arrived: false), as request_text_upload makes. */
async function upload(purpose, bytes, { at = Date.now(), arrived = true, type = TYPES[purpose] } = {}) {
  const id = `upcheck${String(++uploads).padStart(5, "0")}`;
  const key = uploadKey(USER, id);
  if (arrived) await env.UPLOADS.put(key, bytes);
  sqlite
    .prepare("INSERT INTO uploads (id, user_id, filename, content_type, status, size, r2_key, source, created_at, expires_at, stored_at, purpose) VALUES (?, ?, 'f', ?, ?, ?, ?, 'pat:check', ?, ?, ?, ?)")
    .run(id, USER, type, arrived ? "stored" : "pending", arrived ? bytes.byteLength : null, arrived ? key : null, at, at + 900_000, arrived ? at : null, purpose);
  return id;
}
const STORY = "De rode jas\n\nOma heeft een rode jas. De jas hangt aan de deur.\n\nMorgen gaan wij naar de markt.";
const COVER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 3"><rect width="2" height="3" fill="#123456"/></svg>';

// ---------- the tests ----------

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
async function refused(fn, pattern) {
  try {
    await fn();
  } catch (error) {
    ok(pattern.test(error.message), `refused, but with "${error.message}"`);
    return error.message;
  }
  throw new Error(`not refused (wanted ${pattern})`);
}
const filesOf = (changeId) => rows("SELECT id, r2_key FROM uploads WHERE user_id = ? AND purpose = ?", USER, `text-in:${changeId}`);

await test("add_text: the change carries the book it checked and the cleaned cover; what they were made from goes", async () => {
  const text = await upload("text:text", utf8(STORY));
  const cover = await upload("text:cover", utf8(COVER));
  const added = await addText(env, USER, "pat:check", { upload_id: text, language: "nl", cover_upload_id: cover });
  const files = filesOf(added.change_id);
  ok(files.length === 2 && files.every((f) => objects.has(f.r2_key)), `the change's files: ${JSON.stringify(files)}`);
  ok(!row("SELECT 1 AS y FROM uploads WHERE id IN (?, ?)", text, cover) && !objects.has(uploadKey(USER, text)), "the uploads it was made from are gone");
  const change = row("SELECT body FROM text_changes WHERE id = ?", added.change_id);
  ok(JSON.parse(change.body).cover?.file && added.devices[0] === "Check device", JSON.stringify({ body: change.body, devices: added.devices }));
  return `${added.change_id}, ${added.words} words`;
});

await test("Codex's second review: a failure after the change is queued never takes it back (its files stay; the rest goes later)", async () => {
  const text = await upload("text:text", utf8(STORY));
  faults.deletes = true;
  const added = await addText(env, USER, "pat:check", { upload_id: text, language: "nl" });
  faults.deletes = false;
  const files = filesOf(added.change_id);
  ok(files.length === 1 && objects.has(files[0].r2_key), `the change's file is kept: ${JSON.stringify(files)}`);
  ok(row("SELECT body IS NOT NULL AS waiting FROM text_changes WHERE id = ?", added.change_id).waiting === 1, "the change is on its way");
  ok(row("SELECT COUNT(*) AS n FROM text_deliveries d JOIN text_changes c ON c.seq = d.change_seq WHERE c.id = ? AND d.state = 'waiting'", added.change_id).n === 1, "its delivery waits");
  const claim = row("SELECT id FROM uploads WHERE purpose = ?", `text-claim:${added.change_id}:text`);
  ok(claim?.id === text, "what it was made from waits for the next tidy");
  await tidy(env, USER, Date.now() + TEXT_RELAY.staging + 60_000);
  ok(!row("SELECT 1 AS y FROM uploads WHERE id = ?", text) && !objects.has(uploadKey(USER, text)), "a day on, the tidy takes it");
  ok(filesOf(added.change_id).length === 1, "and leaves the change's own file");
});

await test("a failure before the change is queued leaves nothing behind, and the upload can be used again", async () => {
  const text = await upload("text:text", utf8(STORY));
  const cover = await upload("text:cover", utf8(COVER), { arrived: false });
  const before = rows("SELECT purpose FROM uploads WHERE purpose LIKE 'text-in:%'").length;
  await refused(() => addText(env, USER, "pat:check", { upload_id: text, language: "nl", cover_upload_id: cover }), /hasn't arrived yet/);
  ok(row("SELECT purpose FROM uploads WHERE id = ?", text).purpose === "text:text", "the text's upload is waiting for a text again");
  ok(rows("SELECT purpose FROM uploads WHERE purpose LIKE 'text-in:%'").length === before, "no change files were left");
  const broken = await upload("text:book", utf8("{ not json"));
  await refused(() => addText(env, USER, "pat:check", { upload_id: broken, language: "nl" }), /isn't JSON/);
  ok(row("SELECT purpose FROM uploads WHERE id = ?", broken).purpose === "text:book", "a refused book's upload is back too");
  const again = await addText(env, USER, "pat:check", { upload_id: text, language: "nl" });
  return `then added as ${again.change_id}`;
});

await test("Codex's second review: an EPUB keeps its own title unless your AI gives one", async () => {
  const epub = makeEpub({ title: "Het eigen boek", lang: "nl", chapters: [{ title: "Een", paragraphs: ["Oma heeft een rode jas."] }] });
  const own = await addText(env, USER, "pat:check", { upload_id: await upload("text:epub", epub), language: "nl" });
  const ownBody = JSON.parse(row("SELECT body FROM text_changes WHERE id = ?", own.change_id).body);
  ok(ownBody.format === "epub" && !ownBody.retitle, `untitled: ${JSON.stringify(ownBody)}`);
  const named = await addText(env, USER, "pat:check", { upload_id: await upload("text:epub", epub), language: "nl", title: "Mijn titel" });
  const namedBody = JSON.parse(row("SELECT body FROM text_changes WHERE id = ?", named.change_id).body);
  ok(namedBody.retitle === true && namedBody.title === "Mijn titel", `titled: ${JSON.stringify(namedBody)}`);
});

await test("Codex's second review: Undo brings a removed text back only while the devices keep it (7 days); a second remove is refused", async () => {
  const added = await addText(env, USER, "pat:check", { upload_id: await upload("text:text", utf8(STORY)), language: "nl" });
  const removed = await removeText(env, USER, "pat:check", { text_id: added.text_id });
  await refused(() => removeText(env, USER, "pat:check", { text_id: added.text_id }), /removed already/);
  const undone = await undoTextChange(env, USER, "pat:check", removed.change_id);
  ok(undone.change_id, "undone within the 7 days");
  const again = await removeText(env, USER, "pat:check", { text_id: added.text_id });
  sqlite.prepare("UPDATE text_changes SET created_at = ? WHERE id = ?").run(Date.now() - TEXT_RELAY.keep - 60_000, again.change_id);
  return await refused(() => undoTextChange(env, USER, "pat:check", again.change_id), /7 days after it was removed/);
});

await test("Codex's second review: get_text says a change past its 7 days expired, not that it's on its way", async () => {
  const added = await addText(env, USER, "pat:check", { upload_id: await upload("text:text", utf8(STORY)), language: "nl" });
  sqlite.prepare("UPDATE text_changes SET expires_at = ? WHERE id = ?").run(Date.now() - 1, added.change_id);
  const seen = await getText(env, USER, added.text_id);
  const change = seen.changes.find((c) => c.change_id === added.change_id);
  ok(change && change.on_its_way === false && change.devices[0]?.state === "expired", JSON.stringify(change));
  ok(filesOf(added.change_id).length === 0, "its files went");
});

await test("one upload sent into two add_text calls at once goes into one text", async () => {
  const text = await upload("text:text", utf8(STORY));
  const results = await Promise.allSettled([addText(env, USER, "pat:check", { upload_id: text, language: "nl" }), addText(env, USER, "pat:check", { upload_id: text, language: "nl" })]);
  const won = results.filter((r) => r.status === "fulfilled");
  ok(won.length === 1, results.map((r) => r.status + (r.reason ? `: ${r.reason.message}` : "")).join(" · "));
  return results.find((r) => r.status === "rejected").reason.message;
});

await test("a device saying it's here tidies the text relay: an upload add_text never used goes after a day", async () => {
  const old = await upload("text:text", utf8(STORY), { at: Date.now() - TEXT_RELAY.staging - 60_000 });
  const fresh = await upload("text:text", utf8(STORY));
  await putDevice(env, USER, DEVICE, "Check device", [], []);
  ok(!row("SELECT 1 AS y FROM uploads WHERE id = ?", old) && !objects.has(uploadKey(USER, old)), "the day-old upload is gone");
  ok(row("SELECT 1 AS y FROM uploads WHERE id = ?", fresh) && objects.has(uploadKey(USER, fresh)), "a fresh one stays");
});

await test("Codex's third review: when the device list can't be read, nothing is queued and nothing is left", async () => {
  const text = await upload("text:text", utf8(STORY));
  const count = () => JSON.stringify([row("SELECT COUNT(*) AS n FROM text_changes").n, rows("SELECT id FROM uploads WHERE purpose LIKE 'text-in:%'").length]);
  const before = count();
  faults.failing = /SELECT p\.label FROM text_deliveries/;
  await refused(() => addText(env, USER, "pat:check", { upload_id: text, language: "nl" }), /D1 is busy/);
  faults.failing = null;
  ok(count() === before, `changes and change files, before and after: ${before} → ${count()}`);
  ok(row("SELECT purpose FROM uploads WHERE id = ?", text).purpose === "text:text", "the upload waits for a text again");
});

await test("Codex's third review: a day on, the tidy takes a change file nothing is on its way with (a rollback whose delete failed)", async () => {
  const orphan = await upload("text-in:txc_neverqueued01", utf8("{}"), { at: Date.now() - 2 * TEXT_RELAY.staging, type: "application/json" });
  const live = await addText(env, USER, "pat:check", { upload_id: await upload("text:text", utf8(STORY)), language: "nl" });
  sqlite.prepare("UPDATE uploads SET stored_at = ?, created_at = ? WHERE purpose = ?").run(Date.now() - 2 * TEXT_RELAY.staging, Date.now() - 2 * TEXT_RELAY.staging, `text-in:${live.change_id}`);
  await tidy(env, USER, Date.now());
  ok(!row("SELECT 1 AS y FROM uploads WHERE id = ?", orphan) && !objects.has(uploadKey(USER, orphan)), "the orphan is gone");
  ok(filesOf(live.change_id).length === 1, "a change on its way keeps its file, however old");
});

await test("Codex's third review: an expired change's files that storage couldn't delete go with a later tidy", async () => {
  const added = await addText(env, USER, "pat:check", { upload_id: await upload("text:text", utf8(STORY)), language: "nl" });
  sqlite.prepare("UPDATE text_changes SET expires_at = ? WHERE id = ?").run(Date.now() - 1, added.change_id);
  faults.deletes = true;
  await tidy(env, USER, Date.now());
  faults.deletes = false;
  ok(row("SELECT body FROM text_changes WHERE id = ?", added.change_id).body === null && filesOf(added.change_id).length === 1, "expired; its file couldn't go yet");
  await tidy(env, USER, Date.now() + TEXT_RELAY.staging + 60_000);
  ok(filesOf(added.change_id).length === 0, "the next tidy took it");
});

await test("Codex's third review: storage down never stops a device saying it's here (the tidy waits for next time)", async () => {
  const old = await upload("text:text", utf8(STORY), { at: Date.now() - TEXT_RELAY.staging - 60_000 });
  sqlite.prepare("UPDATE pack_devices SET seen_at = 0 WHERE device_id = ?").run(DEVICE);
  faults.deletes = true;
  await putDevice(env, USER, DEVICE, "Check device", [], []);
  faults.deletes = false;
  ok(row("SELECT seen_at FROM pack_devices WHERE device_id = ?", DEVICE).seen_at > 0, "the device was seen");
  ok(row("SELECT 1 AS y FROM uploads WHERE id = ?", old), "the stale upload waits");
  await putDevice(env, USER, DEVICE, "Check device", [], []);
  ok(!row("SELECT 1 AS y FROM uploads WHERE id = ?", old), "and goes the next time");
});

await test("a device back after 30 days away gets what's still on its way again, texts and packs (it used to fail to register)", async () => {
  const added = await addText(env, USER, "pat:check", { upload_id: await upload("text:text", utf8(STORY)), language: "nl" });
  const now = Date.now();
  sqlite.prepare("INSERT INTO pack_changes (id, user_id, pack_id, kind, body, said, source, created_at, expires_at) VALUES ('chg_checkback01', ?, 'pack-check', 'update', '{}', 'updated', 'pat:check', ?, ?)").run(USER, now, now + TEXT_RELAY.keep);
  const packSeq = row("SELECT seq FROM pack_changes WHERE id = 'chg_checkback01'").seq;
  sqlite.prepare("INSERT INTO pack_deliveries (change_seq, user_id, device_id, state) VALUES (?, ?, ?, 'waiting')").run(packSeq, USER, DEVICE);
  sqlite.prepare("UPDATE pack_devices SET seen_at = ? WHERE device_id = ?").run(now - TEXT_RELAY.deviceGone - 60_000, DEVICE);
  const back = await putDevice(env, USER, DEVICE, "Check device", [], []);
  ok(back.added === true, `registered again as new: ${JSON.stringify(back)}`);
  const textState = row("SELECT d.state FROM text_deliveries d JOIN text_changes c ON c.seq = d.change_seq WHERE c.id = ? AND d.device_id = ?", added.change_id, DEVICE).state;
  const packState = row("SELECT state FROM pack_deliveries WHERE change_seq = ? AND device_id = ?", packSeq, DEVICE).state;
  ok(textState === "waiting" && packState === "waiting", JSON.stringify({ textState, packState }));
});

await test("Codex's fourth review: add_text names the devices it goes to: one registering before the batch is named and gets it; one after isn't named, and gets it anyway", async () => {
  // Registers right after add_text claims the upload (before the change's batch).
  faults.between = { pattern: /UPDATE uploads SET purpose = \? WHERE id = \?/, run: () => putDevice(env, USER, "device-check-2", "Second device", [], []) };
  const early = await addText(env, USER, "pat:check", { upload_id: await upload("text:text", utf8(STORY)), language: "nl" });
  ok(JSON.stringify([...early.devices].sort()) === '["Check device","Second device"]', JSON.stringify(early.devices));
  // Registers right after the change's batch (D1 lets nothing in between its statements).
  faults.between = { pattern: /FROM pack_devices/, run: () => putDevice(env, USER, "device-check-3", "Third device", [], []) };
  const late = await addText(env, USER, "pat:check", { upload_id: await upload("text:text", utf8(STORY)), language: "nl" });
  ok(!late.devices.includes("Third device"), JSON.stringify(late.devices));
  const goesTo = rows("SELECT d.device_id FROM text_deliveries d JOIN text_changes c ON c.seq = d.change_seq WHERE c.id = ? ORDER BY d.device_id", late.change_id).map((r) => r.device_id);
  sqlite.prepare("DELETE FROM pack_devices WHERE device_id IN ('device-check-2', 'device-check-3')").run();
  ok(JSON.stringify(goesTo) === '["device-check-1","device-check-2","device-check-3"]', `it goes to: ${goesTo}`);
  return `named ${late.devices.join(", ")}; the third gets it on registering`;
});

await test("the 6 Nov review (C17): with no device to send it to, a report from a device it was never sent to clears nothing", async () => {
  // Codex's case: the account has no device registered when the text is queued, so there's no delivery at all.
  sqlite.prepare("DELETE FROM pack_devices WHERE user_id = ? AND device_id = ?").run(USER, DEVICE);
  try {
    const text = await upload("text:text", utf8(STORY));
    const added = await addText(env, USER, "pat:check", { upload_id: text, language: "nl" });
    await reportText(env, USER, "device-never-sent", added.change_id, { state: "applied", words: 3 });
    ok(row("SELECT body FROM text_changes WHERE id = ?", added.change_id).body !== null, "an unknown device's report cleared the text");
    ok((await serveTextFile(env, USER, added.change_id, "text")).status === 200, "its file is no longer served");
    return "kept until a device takes it, or it expires";
  } finally {
    sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, ?, 'Check device', '[]', ?, ?)").run(USER, DEVICE, Date.now(), Date.now());
  }
});
await test("the 6 Nov review (C17): the device the text was sent to reporting it in still clears it (the control)", async () => {
  const text = await upload("text:text", utf8(STORY));
  const added = await addText(env, USER, "pat:check", { upload_id: text, language: "nl" });
  await reportText(env, USER, DEVICE, added.change_id, { state: "applied", words: 3 });
  ok(row("SELECT body FROM text_changes WHERE id = ?", added.change_id).body === null, "the device that had it reported, and the text isn't done");
  return "done";
});
await test("the 6 Nov review (C17): a change's files aren't served once it has expired, even before the tidy runs", async () => {
  const text = await upload("text:text", utf8(STORY));
  const added = await addText(env, USER, "pat:check", { upload_id: text, language: "nl" });
  const changeId = added.change_id;
  ok((await serveTextFile(env, USER, changeId, "text")).status === 200, "the control: served while it's waiting");
  sqlite.prepare("UPDATE text_changes SET expires_at = ? WHERE id = ?").run(Date.now() - 1, changeId);
  const late = await serveTextFile(env, USER, changeId, "text");
  ok(late.status === 404, `served after it expired: ${late.status}`);
  return "404 once expired";
});


/** env whose D1 counts its round trips, as D1's queue does: a statement run on its own is one, a batch is one (7 Nov 2026, the load rehearsal). */
function counting() {
  const n = { trips: 0 };
  const wrap = (st) => ({ inner: st, bind: (...a) => wrap(st.bind(...a)), first: (...a) => (n.trips++, st.first(...a)), all: (...a) => (n.trips++, st.all(...a)), run: (...a) => (n.trips++, st.run(...a)), raw: (...a) => (n.trips++, st.raw(...a)) });
  return { n, env: { ...env, DB: { prepare: (sql) => wrap(env.DB.prepare(sql)), batch: (list) => (n.trips++, env.DB.batch(list.map((st) => st.inner ?? st))) } } };
}

await test("a device saying it's here: each piece of the text relay's housekeeping, alone, still done; 2 round trips between", async () => {
  const USER = "user-tidy-text";
  const HERE = "device-tidy-text";
  const now = Date.now();
  const DAY = 86_400_000;
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(USER, "Tidy", now - 200 * DAY);
  sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, ?, 'Tidy device', '[]', ?, ?)").run(USER, HERE, now, now);
  const idle = async (what) => {
    const c = counting();
    await putDevice(c.env, USER, HERE, "Tidy device", [], []);
    ok(c.n.trips === 2, `${what}: ${c.n.trips} round trips, not 2`);
  };
  const said = () => putDevice(env, USER, HERE, "Tidy device", [], []);
  let n = 0;
  const change = ({ body = "{}", created = now, expires = now + TEXT_RELAY.keep, state = "waiting" } = {}) => {
    const id = `txc_tidycheck${String(++n).padStart(2, "0")}`;
    sqlite.prepare("INSERT INTO text_changes (id, user_id, text_id, kind, body, said, source, created_at, expires_at) VALUES (?, ?, 'tidy-text', 'add', ?, 'added', 'pat:check', ?, ?)").run(id, USER, body, created, expires);
    const seq = row("SELECT seq FROM text_changes WHERE id = ?", id).seq;
    sqlite.prepare("INSERT INTO text_deliveries (change_seq, user_id, device_id, state) VALUES (?, ?, ?, ?)").run(seq, USER, HERE, state);
    return { id, seq };
  };
  let ups = 0;
  const staged = (purpose, at) => {
    const id = `uptidy${String(++ups).padStart(5, "0")}`;
    sqlite
      .prepare("INSERT INTO uploads (id, user_id, filename, content_type, status, size, r2_key, source, created_at, expires_at, stored_at, purpose) VALUES (?, ?, 'f', 'text/plain', 'stored', 1, ?, 'pat:check', ?, ?, ?, ?)")
      .run(id, USER, uploadKey(USER, id), at, at + 900_000, at, purpose);
    return id;
  };
  const gone = (id) => !row("SELECT 1 AS y FROM uploads WHERE id = ?", id);
  await idle("to start");
  const a = change({ expires: now - 1 });
  await said();
  ok(row("SELECT body FROM text_changes WHERE id = ?", a.id).body === null && row("SELECT state FROM text_deliveries WHERE change_seq = ?", a.seq).state === "expired", "an expired change: its content goes, its delivery expires");
  await idle("after the expired change");
  const b = change({ body: null, expires: now - 1 });
  await said();
  ok(row("SELECT state FROM text_deliveries WHERE change_seq = ?", b.seq).state === "expired", "a delivery still waiting for an expired change expires");
  await idle("after the waiting delivery");
  const old = change({ body: null, created: now - TEXT_RELAY.history - DAY, expires: now - TEXT_RELAY.history, state: "applied" });
  await said();
  ok(!row("SELECT 1 AS y FROM text_changes WHERE id = ?", old.id), "a change past its 90 days is forgotten");
  await idle("after the old change");
  for (const [purpose, at, what] of [
    ["text:text", now - TEXT_RELAY.staging - 60_000, "a staged upload add_text never used, a day on"],
    ["text-in:txc_tidyneverq01", now - 2 * TEXT_RELAY.staging, "a change file nothing is on its way with"],
    ["weave-in:book-tidy", now - 2 * 3_600_000, "a weaving copy no request named, an hour on"],
    ["weave-for:req-tidy", now - 16 * DAY, "a weaving copy whose request is long past"],
  ]) {
    const id = staged(purpose, at);
    await said();
    ok(gone(id), what);
    await idle(`after ${what}`);
  }
  return "each one done by the device saying it's here";
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
