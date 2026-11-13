#!/usr/bin/env node
// The account's practice room (src/practice.ts, the PRACTICE Durable Object) in plain Node: the class loaded with cloudflare:workers
// stood in (DurableObject keeps ctx and env), its SQLite storage on node:sqlite, alarms noted and never fired.
//   - an in-app practice (the app's own AI, run on the device) can't be ended or summarized by an AI over MCP: practice_end is
//     refused and the practice goes on, with no summary;
//   - a practice request can't be taken while an in-app practice is going on: the request stays waiting and the practice goes on
//     (taking it would start a practice, which ends the open one);
//   - the controls: an AI's own practice (from the app, joined over MCP) is ended with its summary, and a practice request is
//     taken once nothing is going on, so a room that refused everything fails.
//   - the seat alone is the AI's: a second session of the same app, with no seat or another, can't reply, end the practice or be
//     handed the seat (practice_wait says taken); one that lost its seat takes over only once the holder has gone quiet (the control);
//     an ended practice gives its seat only to the AI holding it;
//   - a full practice (LIMITS.turns, room kept for its end and summary): one more turn refused with nothing stored, then ended by its
//     AI with the "ended" turn and the summary (sent again, replaced), by the app, and by the sweep, never half ended; joining one
//     refused before the seat changes hands; a logged one refused whole before anything is stored, practice_end still ending it;
//   - collecting says which turn the device has: a summary that landed after its fetch keeps the practice on the server ({ more }),
//     and a second fetch takes it; collecting all of it, or from a device from before (no after), lets it go.
// The Codex review's C18: a and b on 6 Nov 2026, c to e the day after. `node scripts/test-practice-room.mjs` (exit 0 = pass)

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { workerEnv } from "./fixtures/worker-env.mjs";

// cloudflare:workers: only DurableObject, as the runtime's base class keeps them.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") {
      return { url: "data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }", shortCircuit: true };
    }
    return next(specifier, context);
  },
});

/** ctx.storage.sql as the runtime gives it: exec(query, ...bindings) → a cursor with toArray() and one(). */
function sqlStorage(db) {
  return {
    exec(query, ...bindings) {
      const rows = db.prepare(query).all(...bindings).map((row) => ({ ...row }));
      return {
        toArray: () => rows,
        one() {
          if (rows.length !== 1) throw new Error(`Expected exactly one result from SQL query, but got ${rows.length}.`);
          return rows[0];
        },
        [Symbol.iterator]: () => rows[Symbol.iterator](),
      };
    },
  };
}

function room(PracticeRoom, env) {
  const db = new DatabaseSync(":memory:");
  const alarms = [];
  const storage = {
    sql: sqlStorage(db),
    async setAlarm(at) {
      alarms.push(at);
    },
    async deleteAlarm() {},
    async getAlarm() {
      return alarms.at(-1) ?? null;
    },
    async deleteAll() {},
  };
  const r = new PracticeRoom({ storage, id: { toString: () => "test-room" } }, env);
  // The room's own SQLite, for a test to move its clock (a seat gone quiet, a practice from hours ago).
  Object.defineProperty(r, "testDb", { value: db });
  return r;
}

const { env } = workerEnv();
const { PracticeRoom } = await import("../src/practice.ts");
const { LIMITS } = await import("../public/js/practice/protocol.js");

const SOURCE = "claude-code:test";
const SETTINGS = { kind: "story", answer: "both", minutes: 10, language: "nl" };
const SUMMARY = { text: "Goed gedaan.", went_well: ["perfect"] };
const fails = [];
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    fails.push(name);
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").join("\n        ")}`);
  }
}
const noError = (value, what) => {
  assert.ok(!(value && typeof value === "object" && "error" in value), `${what}: ${JSON.stringify(value)}`);
  return value;
};

await test("an in-app practice: practice_end over MCP is refused, the practice goes on, no summary", async () => {
  const r = room(PracticeRoom, env);
  const practice = noError(await r.create({ ...SETTINGS, inapp: { engine: "plan" } }, null), "create");
  assert.equal(practice.state, "live");
  assert.equal(practice.engine, "plan");
  const ended = await r.aiEnd(SOURCE, { practiceId: practice.id, seat: "inapp:plan", summary: SUMMARY });
  assert.match(String(ended?.error), /run by the app's own AI/, `practice_end answered ${JSON.stringify(ended)}`);
  const after = noError(await r.get(practice.id), "get");
  assert.equal(after.state ?? after.practice?.state, "live", `the practice: ${JSON.stringify(after).slice(0, 300)}`);
  assert.ok(!JSON.stringify(after).includes("Goed gedaan"), "a summary was stored");
});

await test("the same with no seat given, and with the own-key engine", async () => {
  const r = room(PracticeRoom, env);
  const practice = noError(await r.create({ ...SETTINGS, inapp: { engine: "own-key" } }, null), "create");
  const ended = await r.aiEnd(SOURCE, { practiceId: practice.id, summary: SUMMARY });
  assert.match(String(ended?.error), /run by the app's own AI/, `practice_end answered ${JSON.stringify(ended)}`);
  const after = noError(await r.get(practice.id), "get");
  assert.equal(after.state ?? after.practice?.state, "live");
});

await test("control: an AI's practice from the app, joined over MCP, is ended with its summary", async () => {
  const r = room(PracticeRoom, env);
  const practice = noError(await r.create(SETTINGS, null), "create");
  const joined = noError(await r.aiWait(SOURCE, { waitMs: 0 }), "practice_wait");
  const seat = joined.seat ?? joined.practice?.seat;
  assert.ok(seat, `practice_wait gave no seat: ${JSON.stringify(joined).slice(0, 300)}`);
  const ended = noError(await r.aiEnd(SOURCE, { practiceId: practice.id, seat, summary: SUMMARY }), "practice_end");
  const after = noError(await r.get(practice.id), "get");
  assert.equal(after.state ?? after.practice?.state, "ended", `ended: ${JSON.stringify(ended).slice(0, 200)}`);
  assert.ok(JSON.stringify(after).includes("Goed gedaan"), "no summary stored");
});

await test("a practice request isn't taken while an in-app practice goes on: it stays waiting, the practice goes on", async () => {
  const r = room(PracticeRoom, env);
  const request = noError(await r.createRequest({ kind: "practice", practice: { kind: "story", minutes: 15, language: "nl" } }), "createRequest");
  const practice = noError(await r.create({ ...SETTINGS, inapp: { engine: "plan" } }, null), "create");
  const taken = await r.aiTakeRequest(SOURCE, request.id);
  assert.match(String(taken?.error), /A practice is going on/, `take_request answered ${JSON.stringify(taken).slice(0, 300)}`);
  const after = noError(await r.get(practice.id), "get");
  assert.equal(after.state ?? after.practice?.state, "live", "the in-app practice was ended");
  const listed = noError(await r.aiListRequests(SOURCE), "list_requests");
  assert.equal(listed.find((q) => q.id === request.id)?.state, "waiting", `the request: ${JSON.stringify(listed)}`);
});

await test("control: with nothing going on, the practice request is taken and starts its practice", async () => {
  const r = room(PracticeRoom, env);
  const request = noError(await r.createRequest({ kind: "practice", practice: { kind: "story", minutes: 15, language: "nl" } }), "createRequest");
  const taken = noError(await r.aiTakeRequest(SOURCE, request.id), "take_request");
  assert.ok(taken.practice?.id, `no practice started: ${JSON.stringify(taken).slice(0, 300)}`);
  assert.equal(taken.request.state, "done");
});

await test("control: an AI's practice going on also holds the request back (the rule before C18)", async () => {
  const r = room(PracticeRoom, env);
  const request = noError(await r.createRequest({ kind: "practice", practice: { kind: "story", minutes: 15, language: "nl" } }), "createRequest");
  noError(await r.create(SETTINGS, null), "create");
  const taken = await r.aiTakeRequest(SOURCE, request.id);
  assert.match(String(taken?.error), /A practice is going on/);
});


// ---------- C18 c: the seat alone is the AI's ----------

const REPLY = { explain: "Goed zo." };
const turnsOf = async (r, id) => noError(await r.get(id), "get").turns;
const lastSeq = async (r, id) => Math.max(0, ...(await turnsOf(r, id)).map((t) => t.seq));
const stateOf = async (r, id) => noError(await r.get(id), "get").practice.state;
async function joined(r) {
  const practice = noError(await r.create(SETTINGS, null), "create");
  const a = noError(await r.aiWait(SOURCE, { waitMs: 0 }), "practice_wait");
  assert.equal(a.status, "joined", `the first AI: ${JSON.stringify(a).slice(0, 200)}`);
  assert.ok(a.seat, "no seat");
  return { practice, seat: a.seat };
}

await test("a second session of the same app, with no seat or another: no reply, no end, and practice_wait says taken", async () => {
  const r = room(PracticeRoom, env);
  const { practice, seat } = await joined(r);
  const before = await lastSeq(r, practice.id);
  for (const other of [undefined, "not-its-seat"]) {
    const reply = await r.aiReply(SOURCE, { practiceId: practice.id, seat: other, reply: REPLY });
    assert.match(String(reply?.error), other ? /run by another AI session/ : /Give the seat practice_wait gave you/, `practice_reply (seat ${other}): ${JSON.stringify(reply)}`);
    const ended = await r.aiEnd(SOURCE, { practiceId: practice.id, seat: other, summary: SUMMARY });
    assert.match(String(ended?.error), other ? /run by another AI session/ : /Give the seat/, `practice_end (seat ${other}): ${JSON.stringify(ended)}`);
  }
  assert.equal(await lastSeq(r, practice.id), before, "a turn was stored");
  assert.equal(await stateOf(r, practice.id), "live");
  const second = await r.aiWait(SOURCE, { practiceId: practice.id, waitMs: 1000 });
  assert.equal(second.status, "taken", `practice_wait with no seat: ${JSON.stringify(second).slice(0, 200)}`);
  assert.equal(second.seat, undefined, "the holder's seat was handed out");
  // The holder goes on.
  noError(await r.aiReply(SOURCE, { practiceId: practice.id, seat, reply: REPLY }), "the holder's practice_reply");
});

await test("control: a session that lost its seat takes the practice over once the holder has gone quiet", async () => {
  const r = room(PracticeRoom, env);
  const { practice, seat } = await joined(r);
  r.testDb.prepare("UPDATE practices SET seat_seen_at = 0 WHERE id = ?").run(practice.id);
  const b = noError(await r.aiWait(SOURCE, { waitMs: 0 }), "practice_wait after the holder went quiet");
  assert.equal(b.status, "joined", JSON.stringify(b).slice(0, 200));
  assert.notEqual(b.seat, seat);
  const old = await r.aiReply(SOURCE, { practiceId: practice.id, seat, reply: REPLY });
  assert.match(String(old?.error), /run by another AI session/, "the old seat still works");
  noError(await r.aiReply(SOURCE, { practiceId: practice.id, seat: b.seat, reply: REPLY }), "the new holder's reply");
});

await test("an ended practice gives its seat only to the AI holding it, which ends it with its summary", async () => {
  const r = room(PracticeRoom, env);
  const { practice, seat } = await joined(r);
  noError(await r.endFromApp(practice.id), "ended in the app");
  const other = noError(await r.aiWait(SOURCE, { practiceId: practice.id, waitMs: 0 }), "practice_wait, no seat");
  assert.equal(other.status, "ended");
  assert.equal(other.seat, undefined, "its seat was handed to a session without it");
  const holder = noError(await r.aiWait(SOURCE, { practiceId: practice.id, seat, waitMs: 0 }), "practice_wait, the seat");
  assert.equal(holder.seat, seat);
  const refused = await r.aiEnd(SOURCE, { practiceId: practice.id, summary: SUMMARY });
  assert.match(String(refused?.error), /Give the seat/);
  noError(await r.aiEnd(SOURCE, { practiceId: practice.id, seat, summary: SUMMARY }), "the holder's practice_end");
  assert.ok((await turnsOf(r, practice.id)).some((t) => t.type === "summary"), "no summary");
});

// ---------- C18 d: a full practice still ends, whole ----------

const ROOM = LIMITS.turns - 2; // what turns other than the end and the summary may fill
async function fill(r, id, upTo = ROOM) {
  for (let seq = await lastSeq(r, id); seq < upTo; ) seq = noError(await r.learnerTurn(id, { type: "hint" }), "a turn").turn.seq;
  assert.equal(await lastSeq(r, id), upTo);
}
const endedTurns = (turns) => turns.filter((t) => t.type === "ended");

await test("a full practice: one more turn refused with nothing stored; its AI ends it with the ended turn and the summary", async () => {
  const r = room(PracticeRoom, env);
  const { practice, seat } = await joined(r);
  await fill(r, practice.id);
  const more = await r.learnerTurn(practice.id, { type: "hint" });
  assert.match(String(more?.error), /This practice is full/, `one more turn: ${JSON.stringify(more).slice(0, 200)}`);
  const reply = await r.aiReply(SOURCE, { practiceId: practice.id, seat, reply: REPLY });
  assert.match(String(reply?.error), /This practice is full/);
  assert.equal(await lastSeq(r, practice.id), ROOM, "a refused turn was stored");
  assert.equal(await stateOf(r, practice.id), "live", "a refused turn ended it");
  noError(await r.aiEnd(SOURCE, { practiceId: practice.id, seat, summary: SUMMARY }), "practice_end");
  let turns = await turnsOf(r, practice.id);
  assert.equal(await stateOf(r, practice.id), "ended");
  assert.deepEqual(turns.slice(-2).map((t) => [t.seq, t.type]), [[ROOM + 1, "ended"], [ROOM + 2, "summary"]]);
  // Sent again, the summary replaces the one before, in the same place.
  noError(await r.aiEnd(SOURCE, { practiceId: practice.id, seat, summary: { ...SUMMARY, text: "Nog beter." } }), "practice_end again");
  turns = await turnsOf(r, practice.id);
  assert.equal(turns.filter((t) => t.type === "summary").length, 1);
  assert.equal(turns.at(-1).text, "Nog beter.");
  assert.ok(Math.max(...turns.map((t) => t.seq)) <= LIMITS.turns, `past ${LIMITS.turns}: ${turns.at(-1).seq}`);
});

await test("a full practice ended in the app and by the sweep: its ended turn every time, and its AI's summary after", async () => {
  for (const how of ["app", "sweep"]) {
    const r = room(PracticeRoom, env);
    const { practice, seat } = await joined(r);
    await fill(r, practice.id);
    if (how === "app") noError(await r.endFromApp(practice.id), "ended in the app");
    else {
      r.testDb.prepare("UPDATE practices SET created_at = created_at - ? WHERE id = ?").run(3 * 3600_000, practice.id);
      noError(await r.list(), "the list, which sweeps");
    }
    assert.equal(await stateOf(r, practice.id), "ended", how);
    assert.equal(endedTurns(await turnsOf(r, practice.id)).length, 1, `${how}: no ended turn`);
    noError(await r.aiEnd(SOURCE, { practiceId: practice.id, seat, summary: SUMMARY }), `${how}: the summary after`);
    assert.equal((await turnsOf(r, practice.id)).at(-1).type, "summary");
  }
});

await test("joining a full practice whose AI went quiet is refused before the seat changes hands", async () => {
  const r = room(PracticeRoom, env);
  const { practice, seat } = await joined(r);
  await fill(r, practice.id);
  r.testDb.prepare("UPDATE practices SET seat_seen_at = 0 WHERE id = ?").run(practice.id);
  const b = await r.aiWait(SOURCE, { waitMs: 0 });
  assert.match(String(b?.error), /This practice is full/, `practice_wait: ${JSON.stringify(b).slice(0, 200)}`);
  assert.equal(await lastSeq(r, practice.id), ROOM);
  // The seat is still the first AI's: it ends the practice with its summary.
  noError(await r.aiEnd(SOURCE, { practiceId: practice.id, seat, summary: SUMMARY }), "the holder's practice_end");
});

await test("a full logged practice: a call is refused whole before anything is stored; practice_end still ends it", async () => {
  const r = room(PracticeRoom, env);
  const line = (i) => ({ who: i % 2 ? "ai" : "you", ...(i % 2 ? { explain: `Uitleg ${i}.` } : { text: `Zin ${i}.` }) });
  const batch = (n, from) => Array.from({ length: n }, (_, i) => line(from + i));
  const first = noError(await r.aiLog(SOURCE, { turns: batch(LIMITS.logTurns, 0) }), "the first practice_log");
  for (let seq = first.seqs.at(-1); seq < ROOM; ) {
    const logged = noError(await r.aiLog(SOURCE, { practiceId: first.practiceId, turns: batch(Math.min(LIMITS.logTurns, ROOM - seq), seq) }), "practice_log");
    seq = logged.seqs.at(-1);
  }
  assert.equal(await lastSeq(r, first.practiceId), ROOM);
  for (const call of [{ turns: batch(2, 0) }, { turns: batch(1, 0), done: true }, { turns: batch(1, 0), summary: SUMMARY }]) {
    const refused = await r.aiLog(SOURCE, { practiceId: first.practiceId, ...call });
    assert.match(String(refused?.error), /This logged practice is full/, `${JSON.stringify(Object.keys(call))}: ${JSON.stringify(refused).slice(0, 200)}`);
  }
  assert.equal(await lastSeq(r, first.practiceId), ROOM, "a refused call stored a turn");
  // The two turns kept for the end: practice_end (a log's every call carries a turn) ends it with the summary.
  noError(await r.aiEnd(SOURCE, { practiceId: first.practiceId, summary: SUMMARY }), "practice_end on the full log");
  const turns = await turnsOf(r, first.practiceId);
  assert.equal(await stateOf(r, first.practiceId), "ended");
  assert.deepEqual(turns.slice(-2).map((t) => [t.seq, t.type]), [[ROOM + 1, "ended"], [ROOM + 2, "summary"]]);
});


// ---------- C18 e: collecting says which turn the device has ----------

const seqOf = (turns) => Math.max(0, ...turns.map((t) => t.seq));
const listedOf = async (r, id) => noError(await r.list(), "list").find((p) => p.id === id);

await test("a summary that lands after the device fetched: collecting what it fetched lets nothing go, and a second fetch has it", async () => {
  const r = room(PracticeRoom, env);
  const { practice, seat } = await joined(r);
  noError(await r.learnerTurn(practice.id, { type: "hint" }), "a turn");
  noError(await r.endFromApp(practice.id), "ended in the app");
  const fetched = await turnsOf(r, practice.id); // the device's fetch, before the summary
  assert.ok(!fetched.some((t) => t.type === "summary"));
  noError(await r.aiEnd(SOURCE, { practiceId: practice.id, seat, summary: SUMMARY }), "the summary, landing now");
  assert.deepEqual(await r.collect(practice.id, seqOf(fetched)), { ok: false, more: true });
  assert.equal((await listedOf(r, practice.id))?.collectedAt, null, "collected with the summary unseen");
  const again = await turnsOf(r, practice.id);
  assert.ok(again.some((t) => t.type === "summary"), "the second fetch has no summary");
  assert.deepEqual(await r.collect(practice.id, seqOf(again)), { ok: true });
  assert.equal(typeof (await listedOf(r, practice.id))?.collectedAt, "number");
});

await test("control: collected with all it has, or from a device from before (no after), it's let go", async () => {
  for (const after of ["all", undefined]) {
    const r = room(PracticeRoom, env);
    const { practice } = await joined(r);
    noError(await r.endFromApp(practice.id), "ended in the app");
    const turns = await turnsOf(r, practice.id);
    assert.deepEqual(await r.collect(practice.id, after === "all" ? seqOf(turns) : undefined), { ok: true });
    assert.equal(typeof (await listedOf(r, practice.id))?.collectedAt, "number", String(after));
  }
});

// A practice in a language of their own (12 Nov 2026): the room knows it only through the definition the practice keeps, and only while a
// step that reads it runs, never between calls.
await test("a practice in a language of their own (Burmese): started with its definition, the AI shown its name and definition, a reply graded on a Burmese word and a summary taken; a logged one takes the definition the app sent; the registry never keeps it", async () => {
  const { LANGUAGES } = await import("../public/js/lang/index.js");
  const BURMESE = { name: "Burmese", written: "unspaced", case: "any", ends: ["။"] };
  const KEPT = { name: "Burmese", direction: "ltr", written: "unspaced", case: "any", ends: ["။"] };
  const known = () => Object.hasOwn(LANGUAGES, "my");
  const r = room(PracticeRoom, env);
  const practice = noError(await r.create({ kind: "conversation", answer: "type", minutes: 10, language: "my", languageDef: BURMESE }, null), "create");
  assert.ok(!known(), "starting it left Burmese in the registry");
  const joined = noError(await r.aiWait(SOURCE, { waitMs: 0 }), "practice_wait");
  const seat = joined.seat ?? joined.practice?.seat;
  const shown = joined.practice;
  assert.equal(shown.language, "my");
  assert.equal(shown.languageName, "Burmese", `the AI's view: ${JSON.stringify(shown).slice(0, 300)}`);
  assert.deepEqual(shown.languageDef, KEPT);
  assert.ok(!known(), "the AI's view left Burmese in the registry");
  const said = noError(await r.learnerTurn(practice.id, { type: "said", text: "ရေသောက်ချင်တယ်။" }), "their turn");
  const reply = noError(
    await r.aiReply(SOURCE, { practiceId: practice.id, seat, reply: { say: "ကော်ဖီသောက်ချင်လား။", grades: [{ turn: said.turn.seq, verdict: "right", concepts: [{ concept: "w:ရေ", outcome: "right" }] }] } }),
    "practice_reply",
  );
  assert.ok(!known(), "the reply left Burmese in the registry");
  noError(await r.aiEnd(SOURCE, { practiceId: practice.id, seat, summary: { text: "ကောင်းတယ်။", went_well: ["ရေ"] } }), "practice_end");
  assert.ok(!known(), "the summary left Burmese in the registry");
  const after = noError(await r.get(practice.id), "get");
  assert.ok(JSON.stringify(after.turns).includes("w:ရေ"), `the grade on ရေ: ${JSON.stringify(after.turns).slice(0, 400)} (${JSON.stringify(reply).slice(0, 120)})`);
  // A logged one: in the language their app last sent, with the definition it sent.
  const logged = room(PracticeRoom, env);
  noError(await logged.putLearner({ version: 1, language: "my", languageName: "Burmese", languageDef: BURMESE }), "their app's snapshot");
  const log = noError(await logged.aiLog(SOURCE, { turns: [{ who: "you", type: "said", text: "ရေသောက်ချင်တယ်။" }] }), "practice_log");
  assert.ok(!known(), "the log left Burmese in the registry");
  assert.ok(JSON.stringify(log).length > 2, "practice_log answered nothing");
});

console.log(fails.length ? `${fails.length} FAILED` : "all passed");
process.exit(fails.length ? 1 : 0);
