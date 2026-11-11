// Practices on this device. A practice is on the server only while it runs and until a device collects it; after
// that it lives here (IndexedDB lexicommons-practice, store practices), transcript, grades and summary together:
//   { id, mode: app | ai, settings, client, createdAt, startedAt, endedAt, endedBy, endWhy, turns: [turn], recorded:
//     [evidence key], savedAt }
// Grades become evidence here, once each (`recorded`), in the same format as every other way of studying
// (study/progress.js), tagged with where they came from so the scheduling can weigh each kind later, and in the
// practice's language (settings.language), whatever you're learning when it's collected.

import { api, post } from "../shell/api.js";
import { record } from "../study/progress.js";
import { sampleDb, sampleOn } from "../study/sample-mode.js";

/** A practice's language: the one it was started in (one from before practices had one is Dutch). */
export const languageOf = (practice) => practice?.settings?.language ?? "nl";

// The sample learner's own while it's on (study/sample-mode.js).
const DB = sampleDb("lexicommons-practice");
const STORE = "practices";
let opening = null;
const memory = new Map(); // when IndexedDB isn't there (a private window): this visit only

function db() {
  return (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  }));
}

function run(mode, action) {
  return db().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function getPractice(id) {
  try {
    return (await run("readonly", (store) => store.get(id))) ?? memory.get(id) ?? null;
  } catch {
    return memory.get(id) ?? null;
  }
}

/** Every practice on this device, newest first. */
export async function listPractices() {
  let rows;
  try {
    rows = (await run("readonly", (store) => store.getAll())) ?? [];
  } catch {
    rows = [...memory.values()];
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

async function put(practice) {
  memory.set(practice.id, practice);
  try {
    await run("readwrite", (store) => store.put(practice));
  } catch {
    // kept in memory for this visit
  }
}

// One write at a time per practice, so a live room and a collection never record the same grade twice.
const queues = new Map();
function serial(id, fn) {
  const next = (queues.get(id) ?? Promise.resolve()).then(fn, fn);
  queues.set(
    id,
    next.catch(() => {}),
  );
  return next;
}

/** Merges what the server sent (its practice and turns) into this device's copy, and records any new grades. */
export function savePractice(meta, turns = []) {
  return serial(meta.id, async () => {
    const old = (await getPractice(meta.id)) ?? { id: meta.id, turns: [], recorded: [] };
    const bySeq = new Map(old.turns.map((turn) => [turn.seq, turn]));
    for (const turn of turns) bySeq.set(turn.seq, turn);
    // A summary sent again replaces the earlier one.
    const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
    const summaries = merged.filter((t) => t.type === "summary");
    const kept = summaries.length > 1 ? merged.filter((t) => t.type !== "summary" || t === summaries.at(-1)) : merged;
    const practice = {
      ...old,
      id: meta.id,
      mode: meta.mode,
      settings: meta.settings,
      client: meta.client ?? old.client ?? null,
      createdAt: meta.createdAt,
      startedAt: meta.startedAt ?? old.startedAt ?? null,
      endedAt: meta.endedAt ?? old.endedAt ?? null,
      endedBy: meta.endedBy ?? old.endedBy ?? null,
      endWhy: meta.endWhy ?? old.endWhy ?? null,
      state: meta.state,
      turns: kept,
      recorded: old.recorded ?? [],
      savedAt: Date.now(),
    };
    const rows = evidenceRows(practice);
    if (rows.length) {
      record(rows.map(({ key: _key, ...row }) => row));
      practice.recorded = [...practice.recorded, ...rows.map((row) => row.key)];
    }
    await put(practice);
    return practice;
  });
}

/** Records a card's evidence (the room calls this as the card is answered), and remembers it was recorded. */
export function recordCard(practiceId, cardSeq, rows) {
  return serial(practiceId, async () => {
    const practice = (await getPractice(practiceId)) ?? { id: practiceId, turns: [], recorded: [], createdAt: Date.now() };
    const key = `card:${cardSeq}`;
    if (practice.recorded?.includes(key)) return;
    record(rows);
    practice.recorded = [...(practice.recorded ?? []), key];
    await put(practice);
  });
}

const howOf = (practice, seq) => practice.turns.find((t) => t.seq === seq)?.how;

/**
 * The evidence a practice's grades and summary give that this device hasn't recorded yet (each row with its key), in
 * progress.js's format. Your own sentences are free tests (a sentence to translate is recall); a "wrong" says whether
 * your AI marked your exact words (unmarked, it counts for less); a hint from your AI is a nudge; a word the recognizer
 * wasn't sure of isn't counted; avoided patterns stay in the practice's record, not the evidence.
 */
export function evidenceRows(practice) {
  const done = new Set(practice.recorded ?? []);
  const kind = practice.settings?.kind ?? "conversation";
  const base = { activity: `practice:${kind}`, source: "ai", client: practice.client ?? undefined, practice: practice.id, lang: languageOf(practice), v: 2 };
  const rows = [];
  const counted = (outcome) => outcome === "right" || outcome === "wrong" || outcome === "hint";
  const skillOf = (skill, how) => ({ reading: "read", listening: "hear", writing: "say", speaking: "say" })[skill] ?? skill ?? (how === "spoken" ? "say" : "say");
  const unsureOf = (said) => new Set((said?.unsure ?? []).map((word) => word.toLowerCase()));
  for (const turn of practice.turns) {
    if (turn.who !== "ai") continue;
    if (turn.type === "reply") {
      (turn.grades ?? []).forEach((grade, g) => {
        const said = practice.turns.find((t) => t.seq === grade.turn);
        const how = said?.how ?? "typed";
        const unsure = how === "spoken" ? unsureOf(said) : new Set();
        const marked = (grade.marks?.length ?? 0) > 0;
        grade.concepts.forEach((concept, c) => {
          const key = `grade:${turn.seq}:${g}:${c}`;
          if (done.has(key) || !counted(concept.outcome)) return;
          if (concept.concept.startsWith("w:") && unsure.has(concept.concept.slice(2).toLowerCase())) return;
          rows.push({
            key,
            ...base,
            at: turn.at,
            concept: concept.concept,
            outcome: concept.outcome === "wrong" ? "wrong" : "right",
            help: concept.outcome === "hint" ? "nudge" : "none",
            test: kind === "translate" ? "recall" : "free",
            ...(concept.outcome === "wrong" ? { marked } : {}),
            skill: skillOf(concept.skill, how),
            item: `practice:${practice.id}:${grade.turn}`,
            how,
            note: concept.note,
            said: said?.text,
          });
        });
      });
    } else if (turn.type === "summary") {
      const spoken = practice.turns.filter((t) => t.type === "said" && t.how === "spoken").length;
      const typed = practice.turns.filter((t) => t.type === "said" && t.how !== "spoken").length;
      (turn.concepts ?? []).forEach((concept, c) => {
        const key = `summary:${c}:${concept.concept}:${concept.outcome}`;
        if (done.has(key) || !counted(concept.outcome)) return;
        rows.push({
          key,
          ...base,
          at: turn.at,
          concept: concept.concept,
          outcome: concept.outcome === "wrong" ? "wrong" : "right",
          help: concept.outcome === "hint" ? "nudge" : "none",
          test: "judged",
          skill: skillOf(concept.skill, spoken >= typed ? "spoken" : "typed"),
          item: `practice:${practice.id}:summary`,
          note: concept.note,
        });
      });
    }
  }
  return rows;
}

/** What the practice's grades say, concept by concept: used well, missed, with a hint, avoided. */
export function tally(practice) {
  const by = new Map();
  const add = (concept, outcome) => {
    const entry = by.get(concept) ?? { concept, right: 0, wrong: 0, hint: 0, avoided: 0 };
    entry[outcome]++;
    by.set(concept, entry);
  };
  let right = 0;
  let fixed = 0;
  let wrong = 0;
  for (const turn of practice.turns) {
    if (turn.who !== "ai") continue;
    for (const grade of turn.grades ?? []) {
      if (grade.verdict === "right") right++;
      else if (grade.verdict === "fixed") fixed++;
      else if (grade.verdict === "wrong") wrong++;
      for (const c of grade.concepts) add(c.concept, c.outcome);
    }
    if (turn.type === "summary") for (const c of turn.concepts ?? []) add(c.concept, c.outcome);
  }
  for (const turn of practice.turns) if (turn.type === "card") turn.correct ? right++ : wrong++;
  return { right, fixed, wrong, concepts: [...by.values()] };
}

/** The last turn of a transcript the server sent (0 for none): what collecting it says the device has. */
export const lastSeqOf = (turns) => turns.reduce((last, turn) => Math.max(last, Number(turn.seq) || 0), 0);

/** Collects finished practices from the server onto this device (recording their grades), then lets the server go. */
let collecting = null;
export function collectFinished() {
  // The sample learner takes nothing from the server: your practices wait there for you (study/sample-mode.js).
  if (sampleOn()) return Promise.resolve({ count: 0, open: [] });
  return (collecting ??= (async () => {
    try {
      const list = await api("/api/practice");
      let count = 0;
      for (const meta of list) {
        if (meta.state !== "ended" || meta.collectedAt) continue;
        // Let go only up to the last turn this device has: one that lands meanwhile (a late summary) keeps it on the server, fetched again.
        for (let tries = 0; tries < 3; tries++) {
          const full = await api(`/api/practice/${encodeURIComponent(meta.id)}?after=0`);
          await savePractice(full.practice, full.turns);
          const answer = await post(`/api/practice/${encodeURIComponent(meta.id)}/collected`, { after: lastSeqOf(full.turns) });
          if (!answer?.more) break;
        }
        count++;
      }
      return { count, open: list.filter((meta) => meta.state !== "ended") };
    } finally {
      collecting = null;
    }
  })());
}

export async function deletePractice(id) {
  memory.delete(id);
  await run("readwrite", (store) => store.delete(id)).catch(() => {});
}

/** Deletes every practice on this device (Settings → Your data). */
export async function clearPractices() {
  memory.clear();
  await run("readwrite", (store) => store.clear()).catch(() => {});
}
