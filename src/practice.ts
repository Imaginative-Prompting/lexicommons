// Practice with your AI: the live room. One Durable Object per account (PRACTICE.getByName(userId)) holds the account's
// practices while they're on the server: the open one, and finished ones until a device collects them. After that
// they live only on the device (public/js/practice/store.js); the server keeps nothing.
//
// The app and the person's own AI meet here. The site can never call anyone's AI, so the AI waits on practice_wait (a
// held request, up to ~40 s) and the app long-polls the same way. A turn from either side answers the other's wait at
// once. Nothing here runs a model: every reply is the person's AI's, made in their own app.
//
// Ceilings, so nothing runs on: an AI waiting with no practice is told to stop after 10 minutes; a practice with no
// answer from the person for 15 minutes ends; a practice ends after 2 hours or 400 turns; one no AI joins ends after
// 30 minutes; finished practices nobody collects are deleted after 7 days.
//
// It's also where the person's requests for their AI wait (public/js/ai/requests.js: practice with me, add to my pack,
// make a new pack, change my look, a question), which makes it the account's AI room. Requests keep to themselves:
// their own table, their own waits and their own version, so a practice behaves exactly as it does without them. A
// request for a practice, when an AI takes it, starts one the way the app does (doCreate).

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { LibraryError } from "./library";
import { randomId } from "./util";
import {
  placeGrades,
  checkLearnerTurn,
  checkLogTurns,
  checkReply,
  checkSettings,
  checkSummary,
  KINDS,
  LIMITS,
  PracticeError,
} from "../public/js/practice/protocol.js";
import { LANGUAGES, languageName, withOwnLanguage } from "../public/js/lang/index.js";
import { checkFinish, checkRequest, REQUEST_LIMITS, REQUEST_TIMING } from "../public/js/ai/requests.js";
import { grammarReady } from "./grammar";

export { PracticeError };

/**
 * A practice the in-app AI runs, from the app: { engine, name } (the model it's on, for the transcript), or none. engine:
 * "own-key", a key of your own on the device that started it (ai/own-key.js); "plan", Lexicommons' own key on the plan
 * (src/ai-hosted.ts). Which one the app offers is app.ts's to decide.
 */
export type InappEngine = "own-key" | "plan";
function checkInapp(value: unknown): { engine: InappEngine; name: string } | null {
  if (value === undefined || value === null) return null;
  const v = value as { engine?: unknown; name?: unknown };
  if (typeof value !== "object" || Array.isArray(value) || (v.engine !== "own-key" && v.engine !== "plan")) throw new PracticeError("inapp must be { engine: \"own-key\" or \"plan\", name }.");
  const name = typeof v.name === "string" ? v.name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return { engine: v.engine, name: name || (v.engine === "plan" ? "Lexicommons AI" : "Your key") };
}
/** The seat an in-app practice holds says which engine runs it (no AI over MCP ever takes one). */
const INAPP_SEAT: Record<InappEngine, string> = { "own-key": "inapp", plan: "inapp:plan" };

const MINUTE = 60_000;
// Long polls on the requests held at once: the app's (a tab each) and the AI's (wait_for_request).
const REQUEST_WAITS = { app: 6, ai: 8 };

export const PRACTICE_TIMING = {
  aiWaitDefault: 40_000,
  aiWaitMax: 50_000,
  appWaitMax: 25_000,
  seatStale: MINUTE, // another AI may take over a practice whose AI hasn't called for this long
  lobbyGiveUp: 10 * MINUTE, // an AI waiting with no practice open is told to stop
  learnerIdle: 15 * MINUTE,
  neverJoined: 30 * MINUTE,
  longest: 120 * MINUTE,
  keepUncollected: 7 * 24 * 60 * MINUTE,
  keepCollected: 10 * MINUTE, // a little while, so a summary sent just after the device collected still lands
};

/** The turns a practice keeps room for at its end (addTurn). */
const CLOSING_TYPES = new Set(["ended", "summary"]);
const FULL = `This practice is full (${LIMITS.turns} turns, with room kept for its end and summary). End it and start another.`;

type Who = "ai" | "you" | "app";
export type Turn = { seq: number; at: number; who: Who; type: string; key?: string; [field: string]: unknown };

type Row = {
  id: string;
  settings: string;
  mode: string;
  state: string;
  client: string | null;
  seat: string | null;
  seat_seen_at: number | null;
  ai_after: number;
  delivered_at: number | null;
  created_at: number;
  started_at: number | null;
  updated_at: number;
  ended_at: number | null;
  ended_by: string | null;
  end_why: string | null;
  summarized: number;
  collected_at: number | null;
  last_learner_at: number | null;
  last_ai_at: number | null;
};

/** language: the one being learned when it started (a practice from before practices had one is Dutch). */
export type Settings = { kind: keyof typeof KINDS; answer: string; minutes: number; topic?: string; language?: string; languageDef?: LanguageDef; from?: string };
/** A learner's own language's definition, as checkSettings keeps it (lang/index.js ownLanguageDef). */
type LanguageDef = { name: string; direction: "ltr" | "rtl"; written: "spaces" | "unspaced"; case: "lower" | "any"; ends: string[] };

/** What the app sees of a practice. */
export type PracticeMeta = {
  id: string;
  // app: your AI joins over MCP; ai: your AI logs one from its own app; inapp: the in-app AI, made from this account's device
  // (practice/inapp-run.js) with a key of its own or on the plan, its replies checked here as your AI's are.
  mode: "app" | "ai" | "inapp";
  // An in-app practice's engine (checkInapp); null for the others.
  engine: InappEngine | null;
  state: "waiting" | "live" | "ended";
  settings: Settings;
  client: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  endedBy: string | null;
  endWhy: string | null;
  summarized: boolean;
  collectedAt: number | null;
  lastSeq: number;
  ai: Presence;
};

/**
 * Where the person's AI is: absent (none has joined), here (waiting for you), thinking (it has your turn), away (not
 * waiting right now; `since` says how long). The app turns this into words.
 */
export type Presence = { phase: "absent" | "here" | "thinking" | "away"; client: string | null; since: number | null };

export type AiWaitInput = { practiceId?: string; after?: number; seat?: string; waitMs?: number };
export type AiReplyInput = { practiceId: string; seat?: string; reply: unknown };
export type AiEndInput = { practiceId: string; seat?: string; summary: unknown };
export type AiLogInput = { practiceId?: string; kind?: string; language?: string; turns: unknown; done?: boolean; summary?: unknown };

type Waiter<T> = { resolve: (value: T) => void; timer: ReturnType<typeof setTimeout>; practiceId: string | null; seat?: string };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS practices (
     id TEXT PRIMARY KEY, settings TEXT NOT NULL, mode TEXT NOT NULL, state TEXT NOT NULL,
     client TEXT, seat TEXT, seat_seen_at INTEGER, ai_after INTEGER NOT NULL DEFAULT 0, delivered_at INTEGER,
     created_at INTEGER NOT NULL, started_at INTEGER, updated_at INTEGER NOT NULL,
     ended_at INTEGER, ended_by TEXT, end_why TEXT, summarized INTEGER NOT NULL DEFAULT 0, collected_at INTEGER,
     last_learner_at INTEGER, last_ai_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS turns (
     practice_id TEXT NOT NULL, seq INTEGER NOT NULL, at INTEGER NOT NULL, who TEXT NOT NULL, type TEXT NOT NULL,
     key TEXT, body TEXT NOT NULL, PRIMARY KEY (practice_id, seq))`,
  `CREATE TABLE IF NOT EXISTS learner (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS lobby (id INTEGER PRIMARY KEY CHECK (id = 1), since INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS study_records (language TEXT PRIMARY KEY, record TEXT NOT NULL, device TEXT, evidence_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS requests (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL,
     client TEXT, seat TEXT, taken_at INTEGER, result TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  // When an AI last checked in for requests (list, take, wait, finish): the app's "last here".
  `CREATE TABLE IF NOT EXISTS ai_seen (id INTEGER PRIMARY KEY CHECK (id = 1), client TEXT NOT NULL, at INTEGER NOT NULL)`,
];

type RequestRow = {
  id: string;
  kind: string;
  body: string;
  state: string;
  client: string | null;
  seat: string | null;
  taken_at: number | null;
  result: string | null;
  created_at: number;
  updated_at: number;
};

/** A request as the app and the AI see it: what was asked, its state, and how it ended. */
export type RequestMeta = Record<string, unknown> & {
  id: string;
  kind: string;
  state: "waiting" | "taken" | "done" | "couldnt" | "canceled" | "expired";
  client: string | null;
  takenAt: number | null;
  createdAt: number;
  updatedAt: number;
  result: Record<string, unknown> | null;
};

/** "oauth:Claude Code" → "Claude Code"; "pat:my script" → "my script". */
export const clientName = (source: string) => source.replace(/^(oauth|pat|rest):/, "");

/** A PracticeError goes back to the Worker as { error }: an error thrown across RPC loses its class. */
async function attempt<T>(run: () => T | Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PracticeError) return { error: error.message };
    throw error;
  }
}

/** The value of a room call, or a LibraryError (a 400 for the app, a tool error for MCP) with the room's message. */
export function unwrap<T>(result: T): Exclude<T, { error: string }> {
  if (result && typeof result === "object" && "error" in result && typeof (result as { error: unknown }).error === "string") throw new LibraryError((result as { error: string }).error);
  return result as Exclude<T, { error: string }>;
}

export class PracticeRoom extends DurableObject<Env> {
  private sql: SqlStorage;
  private epoch = randomId(6);
  private changes = 0;
  private aiWaiters: Waiter<string>[] = [];
  private appWaiters: Waiter<void>[] = [];
  // Requests' own: changes for the app's list, the app's waits on it, and AIs waiting for a request.
  private requestChanges = 0;
  private requestAppWaiters: Waiter<void>[] = [];
  private requestWaiters: Waiter<string>[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    for (const statement of SCHEMA) this.sql.exec(statement);
  }

  // ---------- reading ----------

  private row(id: string): Row | null {
    return (this.sql.exec<Row>("SELECT * FROM practices WHERE id = ?", id).toArray()[0] as Row | undefined) ?? null;
  }

  private openRow(): Row | null {
    return (this.sql.exec<Row>("SELECT * FROM practices WHERE mode = 'app' AND state != 'ended' ORDER BY created_at DESC LIMIT 1").toArray()[0] as Row | undefined) ?? null;
  }

  /** The practice open in the app, whoever runs it (one at a time): an MCP AI's never includes an in-app one (openRow). */
  private openAppRow(): Row | null {
    return (this.sql.exec<Row>("SELECT * FROM practices WHERE mode IN ('app', 'inapp') AND state != 'ended' ORDER BY created_at DESC LIMIT 1").toArray()[0] as Row | undefined) ?? null;
  }

  private turns(id: string, after = 0): Turn[] {
    return this.sql
      .exec<{ seq: number; at: number; who: string; type: string; key: string | null; body: string }>("SELECT seq, at, who, type, key, body FROM turns WHERE practice_id = ? AND seq > ? ORDER BY seq", id, after)
      .toArray()
      .map((r) => ({ ...(JSON.parse(r.body) as object), seq: r.seq, at: r.at, who: r.who as Who, type: r.type, ...(r.key ? { key: r.key } : {}) }));
  }

  private lastSeq(id: string): number {
    return Number(this.sql.exec<{ s: number | null }>("SELECT MAX(seq) AS s FROM turns WHERE practice_id = ?", id).one().s ?? 0);
  }

  private presence(row: Row): Presence {
    if (row.mode === "inapp") {
      // The in-app AI is always here: it's thinking while a turn of yours has no reply after it.
      const last = this.sql.exec<{ who: string; at: number }>("SELECT who, at FROM turns WHERE practice_id = ? AND who != 'app' ORDER BY seq DESC LIMIT 1", row.id).toArray()[0];
      return last?.who === "you" ? { phase: "thinking", client: row.client, since: last.at } : { phase: "here", client: row.client, since: row.started_at };
    }
    if (!row.seat) return { phase: "absent", client: row.client, since: null };
    if (this.aiWaiters.some((w) => w.practiceId === row.id)) return { phase: "here", client: row.client, since: row.seat_seen_at };
    const lastLearner = Number(this.sql.exec<{ s: number | null }>("SELECT MAX(seq) AS s FROM turns WHERE practice_id = ? AND who = 'you'", row.id).one().s ?? 0);
    const lastReply = Number(this.sql.exec<{ s: number | null }>("SELECT MAX(seq) AS s FROM turns WHERE practice_id = ? AND who = 'ai'", row.id).one().s ?? 0);
    if (lastLearner > lastReply && row.ai_after >= lastLearner) return { phase: "thinking", client: row.client, since: row.delivered_at };
    return { phase: "away", client: row.client, since: row.seat_seen_at };
  }

  private meta(row: Row): PracticeMeta {
    return {
      id: row.id,
      mode: row.mode as PracticeMeta["mode"],
      engine: row.mode === "inapp" ? (row.seat === INAPP_SEAT.plan ? "plan" : "own-key") : null,
      state: row.state as PracticeMeta["state"],
      settings: JSON.parse(row.settings) as Settings,
      client: row.client,
      createdAt: row.created_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      endedBy: row.ended_by,
      endWhy: row.end_why,
      summarized: row.summarized === 1,
      collectedAt: row.collected_at,
      lastSeq: this.lastSeq(row.id),
      ai: this.presence(row),
    };
  }

  // ---------- writing ----------

  private changed() {
    this.changes++;
    const waiting = this.appWaiters;
    this.appWaiters = [];
    for (const w of waiting) {
      clearTimeout(w.timer);
      w.resolve();
    }
  }

  private version() {
    return `${this.epoch}.${this.changes}`;
  }

  /** Wakes the AI's waits: on this practice, or (practiceId null) the ones waiting for any practice to open. */
  private wakeAi(practiceId: string | null, reason: string) {
    const keep: Waiter<string>[] = [];
    for (const w of this.aiWaiters) {
      if (w.practiceId === practiceId) {
        clearTimeout(w.timer);
        w.resolve(reason);
      } else keep.push(w);
    }
    this.aiWaiters = keep;
  }

  /**
   * A practice's last two turns, its end and the summary, always have room: everything else stops CLOSING turns short of LIMITS.turns. A full
   * practice can still end (by you, its AI or the sweep) and keep its summary, never ending with no "ended" turn (7 Nov 2026, Codex C18).
   */
  private addTurn(id: string, who: Who, type: string, body: Record<string, unknown>, key?: string): Turn {
    const seq = this.lastSeq(id) + 1;
    if (!CLOSING_TYPES.has(type) && seq > LIMITS.turns - CLOSING_TYPES.size) throw new PracticeError(FULL);
    const at = Date.now();
    const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    this.sql.exec("INSERT INTO turns (practice_id, seq, at, who, type, key, body) VALUES (?, ?, ?, ?, ?, ?, ?)", id, seq, at, who, type, key ?? null, JSON.stringify(clean));
    if (who === "you") this.sql.exec("UPDATE practices SET updated_at = ?, last_learner_at = ? WHERE id = ?", at, at, id);
    else if (who === "ai") this.sql.exec("UPDATE practices SET updated_at = ?, last_ai_at = ? WHERE id = ?", at, at, id);
    else this.sql.exec("UPDATE practices SET updated_at = ? WHERE id = ?", at, id);
    return { ...clean, seq, at, who, type, ...(key ? { key } : {}) };
  }

  private end(row: Row, by: string, why: string | null) {
    if (row.state === "ended") return;
    const at = Date.now();
    this.sql.exec("UPDATE practices SET state = 'ended', ended_at = ?, ended_by = ?, end_why = ?, updated_at = ? WHERE id = ?", at, by, why, at, row.id);
    this.addTurn(row.id, "app", "ended", { by, why: why ?? undefined });
    this.wakeAi(row.id, "ended");
    this.changed();
    void this.schedule();
  }

  /** When a live practice last saw anything happen, from either side. */
  private lastActivity = (row: Row) => Math.max(row.last_learner_at ?? 0, row.last_ai_at ?? 0, row.started_at ?? 0, row.created_at);

  /** Ends what has run on: nothing for 15 minutes, past 2 hours, or never joined. */
  private sweep(now = Date.now()) {
    for (const row of this.sql.exec<Row>("SELECT * FROM practices WHERE state != 'ended'").toArray() as Row[]) {
      if (now - row.created_at > PRACTICE_TIMING.longest) this.end(row, "app", "It reached two hours.");
      else if (row.state === "waiting" && now - row.created_at > PRACTICE_TIMING.neverJoined) this.end(row, "app", "No AI joined within 30 minutes.");
      else if (row.state === "live" && now - this.lastActivity(row) > PRACTICE_TIMING.learnerIdle) this.end(row, "app", "Nothing happened for 15 minutes.");
    }
  }

  /** The next time something needs ending or deleting. */
  private async schedule() {
    const times: number[] = [];
    for (const row of this.sql.exec<Row>("SELECT * FROM practices").toArray() as Row[]) {
      if (row.state === "waiting") times.push(row.created_at + PRACTICE_TIMING.neverJoined);
      else if (row.state === "live") times.push(Math.min(row.created_at + PRACTICE_TIMING.longest, this.lastActivity(row) + PRACTICE_TIMING.learnerIdle));
      else if (row.collected_at) times.push(row.collected_at + PRACTICE_TIMING.keepCollected);
      else times.push((row.ended_at ?? row.updated_at) + PRACTICE_TIMING.keepUncollected);
    }
    for (const row of this.sql.exec<RequestRow>("SELECT * FROM requests").toArray() as RequestRow[]) {
      if (row.state === "waiting") times.push(row.created_at + REQUEST_TIMING.expire);
      else if (row.state === "taken") times.push((row.taken_at ?? row.updated_at) + REQUEST_TIMING.takenStale);
      else times.push(row.updated_at + REQUEST_TIMING.keepFinished);
    }
    if (!times.length) return this.ctx.storage.deleteAlarm();
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...times) + 1000));
  }

  async alarm() {
    const now = Date.now();
    this.sweep(now);
    for (const row of this.sql.exec<Row>("SELECT * FROM practices WHERE state = 'ended'").toArray() as Row[]) {
      const gone = row.collected_at ? now - row.collected_at > PRACTICE_TIMING.keepCollected : now - (row.ended_at ?? row.updated_at) > PRACTICE_TIMING.keepUncollected;
      if (gone) this.forgetPractice(row.id);
    }
    this.sweepRequests(now);
    await this.schedule();
  }

  private forgetPractice(id: string) {
    this.sql.exec("DELETE FROM turns WHERE practice_id = ?", id);
    this.sql.exec("DELETE FROM practices WHERE id = ?", id);
  }

  // ---------- the app (cookie session) ----------

  /** Starts a practice from the app. Any practice still open is ended first (one at a time). */
  private async doCreate(input: unknown, snapshot: unknown): Promise<PracticeMeta> {
    const settings = checkSettings(input) as Settings;
    const inapp = checkInapp((input as { inapp?: unknown } | null)?.inapp);
    if (snapshot !== undefined && snapshot !== null) this.storeLearner(snapshot);
    const open = this.openAppRow();
    if (open) this.end(open, "you", "You started another practice.");
    const id = randomId(9);
    const now = Date.now();
    if (inapp) {
      // The in-app AI: live from the start, run from the device that started it; no AI over MCP ever joins it.
      this.sql.exec(
        "INSERT INTO practices (id, settings, mode, state, client, seat, seat_seen_at, created_at, started_at, updated_at) VALUES (?, ?, 'inapp', 'live', ?, ?, ?, ?, ?, ?)",
        id,
        JSON.stringify(settings),
        inapp.name,
        INAPP_SEAT[inapp.engine],
        now,
        now,
        now,
        now,
      );
      this.addTurn(id, "app", "joined", { client: inapp.name });
      this.changed();
      await this.schedule();
      return this.meta(this.row(id)!);
    }
    this.sql.exec(
      "INSERT INTO practices (id, settings, mode, state, created_at, updated_at) VALUES (?, ?, 'app', 'waiting', ?, ?)",
      id,
      JSON.stringify(settings),
      now,
      now,
    );
    this.sql.exec("DELETE FROM lobby");
    this.wakeAi(null, "created");
    this.changed();
    await this.schedule();
    return this.meta(this.row(id)!);
  }

  /** The app's long poll: answers at once when anything changed since `version`, else when something does. */
  async poll(id: string, after: number, version: string | null, waitMs: number) {
    const row = this.row(id);
    if (!row) return { gone: true as const };
    const hasNew = this.lastSeq(id) > after;
    if (!hasNew && version === this.version() && waitMs > 0) {
      await new Promise<void>((resolve) => {
        const waiter: Waiter<void> = { resolve, practiceId: id, timer: setTimeout(() => resolve(), Math.min(waitMs, PRACTICE_TIMING.appWaitMax)) };
        this.appWaiters.push(waiter);
        // A few tabs at most: the oldest wait gives way.
        if (this.appWaiters.length > 6) {
          const oldest = this.appWaiters.shift()!;
          clearTimeout(oldest.timer);
          oldest.resolve();
        }
      });
    }
    const fresh = this.row(id);
    if (!fresh) return { gone: true as const };
    return { version: this.version(), now: Date.now(), practice: this.meta(fresh), turns: this.turns(id, after) };
  }

  /** One turn of yours (said, card, hint). Sending the same key twice stores it once. */
  private async doLearnerTurn(id: string, input: unknown): Promise<{ turn: Turn; practice: PracticeMeta }> {
    const row = this.row(id);
    if (!row || (row.mode !== "app" && row.mode !== "inapp")) throw new PracticeError("That practice isn't on the server any more.");
    if (row.state === "ended") throw new PracticeError("That practice has ended.");
    const turn = checkLearnerTurn(input) as Record<string, unknown> & { type: string; key?: string };
    if (turn.key) {
      const existing = this.sql.exec<{ seq: number }>("SELECT seq FROM turns WHERE practice_id = ? AND key = ?", id, turn.key).toArray()[0];
      if (existing) return { turn: this.turns(id, existing.seq - 1)[0]!, practice: this.meta(row) };
    }
    if (turn.type === "card") {
      const dealt = this.turns(id, Number(turn.card) - 1)[0];
      if (!dealt || dealt.seq !== turn.card || dealt.who !== "ai" || !dealt.card) throw new PracticeError("That card isn't in this practice.");
      const answered = this.sql.exec("SELECT 1 FROM turns WHERE practice_id = ? AND type = 'card' AND json_extract(body, '$.card') = ?", id, turn.card).toArray().length;
      if (answered) throw new PracticeError("That card has been answered already.");
    }
    const { type, key, ...body } = turn;
    const stored = this.addTurn(id, "you", type, body, key);
    this.wakeAi(id, "turn");
    this.changed();
    await this.schedule();
    return { turn: stored, practice: this.meta(this.row(id)!) };
  }

  /**
   * The in-app AI's reply, made on your device from your own key: `after` is the last turn it saw. When anything came after that,
   * nothing is kept and it's told so ({ stale }), to answer again with what's new. Checked and placed as your own AI's (doAiReply).
   */
  private async doAppReply(id: string, input: unknown) {
    const row = this.row(id);
    if (!row || row.mode !== "inapp") throw new PracticeError("That practice isn't one the app runs.");
    if (row.state === "ended") throw new PracticeError("This practice has ended.");
    const body = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as { after?: unknown; reply?: unknown };
    const last = this.lastSeq(id);
    if (body.after !== last) return { stale: true as const, after: last };
    const seq = last + 1;
    const { reply, notes } = this.inLanguage(row, () => {
      const reply = checkReply(body.reply, { cardId: `practice:${id}:${seq}`, language: this.languageOf(row) }) as { grades: Grade[]; [k: string]: unknown };
      return { reply, notes: this.placeGrades(id, reply.grades) };
    });
    const stored = this.addTurn(id, "ai", "reply", reply);
    this.changed();
    await this.schedule();
    return { seq: stored.seq, leftOut: notes };
  }

  /** The in-app AI's summary, once you've ended the practice: kept as your own AI's is (doAiEnd). */
  private async doAppSummary(id: string, input: unknown) {
    const row = this.row(id);
    if (!row || row.mode !== "inapp") throw new PracticeError("That practice isn't one the app runs.");
    const summary = this.inLanguage(row, () => checkSummary((input as { summary?: unknown } | null)?.summary, { language: this.languageOf(row) }));
    if (row.state !== "ended") this.end(row, "you", null);
    const existing = this.sql.exec<{ seq: number }>("SELECT seq FROM turns WHERE practice_id = ? AND type = 'summary'", id).toArray()[0];
    if (existing) this.sql.exec("DELETE FROM turns WHERE practice_id = ? AND seq = ?", id, existing.seq);
    const stored = this.addTurn(id, "ai", "summary", summary as Record<string, unknown>);
    this.sql.exec("UPDATE practices SET summarized = 1, collected_at = NULL WHERE id = ?", id);
    this.changed();
    await this.schedule();
    return { seq: stored.seq };
  }

  /**
   * An in-app practice carried on by another engine (the plan's month used up, and a key of yours on this device): its seat and
   * name change, and the transcript says who joined. Which engines the app may switch to is app.ts's to decide.
   */
  private async doSwitchEngine(id: string, input: unknown) {
    const row = this.row(id);
    if (!row || row.mode !== "inapp") throw new PracticeError("That practice isn't one the app runs.");
    if (row.state === "ended") throw new PracticeError("This practice has ended.");
    const inapp = checkInapp(input);
    if (!inapp) throw new PracticeError("inapp must be { engine, name }.");
    this.sql.exec("UPDATE practices SET seat = ?, client = ?, updated_at = ? WHERE id = ?", INAPP_SEAT[inapp.engine], inapp.name, Date.now(), id);
    this.addTurn(id, "app", "joined", { client: inapp.name });
    this.changed();
    await this.schedule();
    return this.meta(this.row(id)!);
  }
  switchEngine(id: string, input: unknown) {
    return attempt(() => this.doSwitchEngine(id, input));
  }

  private async doEndFromApp(id: string) {
    const row = this.row(id);
    if (!row) throw new PracticeError("That practice isn't on the server any more.");
    this.end(row, "you", null);
    return this.meta(this.row(id)!);
  }

  /** Every practice still on the server: the open one, and finished ones not yet collected (or just collected). */
  async list(): Promise<PracticeMeta[]> {
    this.sweep();
    return (this.sql.exec<Row>("SELECT * FROM practices ORDER BY created_at DESC").toArray() as Row[]).map((row) => this.meta(row));
  }

  async get(id: string) {
    const row = this.row(id);
    if (!row) return null;
    return { practice: this.meta(row), turns: this.turns(id) };
  }

  /**
   * The device has stored a finished practice, up to turn `after`: it's deleted here shortly after (see keepCollected). A turn the device
   * hasn't got (a summary that landed between its fetch and this) keeps it here uncollected, and the answer says so ({ more }), so the
   * device fetches it again and nothing it never saw is deleted (7 Nov 2026, Codex C18). A device from before sends no `after`.
   */
  async collect(id: string, after?: unknown) {
    const row = this.row(id);
    if (!row || row.state !== "ended") return { ok: false };
    if (Number.isInteger(after) && this.lastSeq(id) > Number(after)) return { ok: false, more: true };
    this.sql.exec("UPDATE practices SET collected_at = ? WHERE id = ?", Date.now(), id);
    await this.schedule();
    return { ok: true };
  }

  private storeLearner(snapshot: unknown) {
    const json = JSON.stringify(snapshot ?? null);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new PracticeError("The snapshot must be an object.");
    if (json.length > LIMITS.snapshotBytes) throw new PracticeError("The snapshot is too big.");
    this.sql.exec("INSERT INTO learner (id, snapshot, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at", json, Date.now());
    return { ok: true };
  }

  /** What the person knows, as their app last sent it (JSON text: it goes straight back out). */
  async getLearner(): Promise<{ snapshot: string; updatedAt: number } | null> {
    const row = this.sql.exec<{ snapshot: string; updated_at: number }>("SELECT snapshot, updated_at FROM learner WHERE id = 1").toArray()[0];
    return row ? { snapshot: row.snapshot, updatedAt: row.updated_at } : null;
  }

  /** Everything this holds, for the account export, as JSON text. */
  async exportAll(): Promise<string> {
    const practices = (this.sql.exec<Row>("SELECT * FROM practices ORDER BY created_at").toArray() as Row[]).map((row) => ({ ...this.meta(row), turns: this.turns(row.id) }));
    const learner = await this.getLearner();
    const requests = (this.sql.exec<RequestRow>("SELECT * FROM requests ORDER BY created_at").toArray() as RequestRow[]).map((row) => this.requestMeta(row));
    const studyRecords = this.sql.exec<{ record: string; updated_at: number }>("SELECT record, updated_at FROM study_records").toArray().map((row) => ({ updatedAt: row.updated_at, record: JSON.parse(row.record) as unknown }));
    return JSON.stringify({ practices, learner: learner && { updatedAt: learner.updatedAt, snapshot: JSON.parse(learner.snapshot) }, studyRecords, requests, aiCheckedIn: this.aiSeen() });
  }

  // Your study record, one per language (public/js/ai/study-record.js, src/coach.ts). A device that hasn't studied since doesn't overwrite one that has;
  // the device that sent it can always replace its own (it may have cleared its progress).
  async putRecord(record: { language: string; device?: string; evidenceAt: number }): Promise<{ ok: boolean; kept: boolean }> {
    const json = JSON.stringify(record);
    if (json.length > LIMITS.recordBytes) throw new PracticeError("The study record is too big.");
    const now = Date.now();
    const device = typeof record.device === "string" ? record.device.slice(0, 64) : "";
    const written = this.sql.exec(
      `INSERT INTO study_records (language, record, device, evidence_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (language) DO UPDATE SET record = excluded.record, device = excluded.device, evidence_at = excluded.evidence_at, updated_at = excluded.updated_at
       WHERE excluded.evidence_at >= study_records.evidence_at OR excluded.device = study_records.device`,
      record.language, json, device, record.evidenceAt, now,
    ).rowsWritten;
    // A dozen languages at most: the oldest goes.
    this.sql.exec("DELETE FROM study_records WHERE language NOT IN (SELECT language FROM study_records ORDER BY updated_at DESC LIMIT 12)");
    return { ok: true, kept: written > 0 };
  }

  /** A language's record (JSON text), or the one studied last. */
  async getRecord(language?: string): Promise<{ language: string; record: string; updatedAt: number } | null> {
    const row = (language
      ? this.sql.exec<{ language: string; record: string; updated_at: number }>("SELECT language, record, updated_at FROM study_records WHERE language = ?", language)
      : this.sql.exec<{ language: string; record: string; updated_at: number }>("SELECT language, record, updated_at FROM study_records ORDER BY evidence_at DESC, updated_at DESC LIMIT 1")
    ).toArray()[0];
    return row ? { language: row.language, record: row.record, updatedAt: row.updated_at } : null;
  }

  async recordLanguages(): Promise<{ language: string; updatedAt: number; bytes: number }[]> {
    return this.sql.exec<{ language: string; updated_at: number; bytes: number }>("SELECT language, updated_at, LENGTH(record) AS bytes FROM study_records ORDER BY updated_at DESC").toArray().map((row) => ({ language: row.language, updatedAt: row.updated_at, bytes: row.bytes }));
  }

  /** No AI any more: nothing of it stays here. */
  async clearRecords() {
    this.sql.exec("DELETE FROM study_records");
    return { ok: true };
  }

  /** Deletes everything (the account is being deleted). */
  async wipe() {
    for (const w of this.aiWaiters) {
      clearTimeout(w.timer);
      w.resolve("ended");
    }
    for (const w of this.appWaiters) {
      clearTimeout(w.timer);
      w.resolve();
    }
    for (const w of [...this.requestWaiters, ...this.requestAppWaiters]) {
      clearTimeout(w.timer);
      (w.resolve as (value?: string) => void)("ended");
    }
    this.aiWaiters = [];
    this.appWaiters = [];
    this.requestWaiters = [];
    this.requestAppWaiters = [];
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    return { ok: true };
  }

  // ---------- the person's AI (MCP) ----------

  /**
   * practice_wait. Joins the open practice (or the one named), then answers with your new turns as soon as there are
   * any, or after waitMs with nothing. `after`: the last seq of yours it has seen (the server remembers it too).
   */
  private async doAiWait(source: string, input: AiWaitInput) {
    const client = clientName(source);
    const waitMs = Math.max(1000, Math.min(input.waitMs ?? PRACTICE_TIMING.aiWaitDefault, PRACTICE_TIMING.aiWaitMax));
    const deadline = Date.now() + waitMs;
    this.sweep();

    let row = input.practiceId ? this.row(input.practiceId) : this.openRow();
    if (input.practiceId && !row) return { status: "not_found" as const };
    if (!row) {
      // Nothing open: wait for the person to start one, but not for ever.
      const lobby = this.sql.exec<{ since: number }>("SELECT since FROM lobby WHERE id = 1").toArray()[0];
      const since = lobby?.since ?? Date.now();
      if (!lobby) this.sql.exec("INSERT INTO lobby (id, since) VALUES (1, ?)", since);
      if (Date.now() - since > PRACTICE_TIMING.lobbyGiveUp) {
        this.sql.exec("DELETE FROM lobby");
        return { status: "stop" as const, why: "No practice was started in the app for 10 minutes." };
      }
      const reason = await this.aiPark(null, input.seat, deadline - Date.now());
      row = this.openRow();
      if (!row) return { status: reason === "superseded" ? ("superseded" as const) : ("no_practice" as const), waitingSince: since };
    }
    if (row.mode !== "app") return { status: "not_found" as const };
    // The seat alone says it's the same AI: two sessions of one app share its name (7 Nov 2026, Codex C18). One that lost its seat joins
    // again only as any AI does, once the holder has gone quiet.
    const sameAi = Boolean(row.seat) && input.seat === row.seat;
    if (row.state === "ended") {
      return { status: "ended" as const, practice: this.forAi(row), seat: sameAi ? row.seat : undefined, by: row.ended_by, why: row.end_why, summarized: row.summarized === 1 };
    }

    // Who runs this practice: the first AI to join holds its seat while it keeps calling.
    let joined = false;
    if (!sameAi) {
      const holderActive = row.seat && (this.aiWaiters.some((w) => w.practiceId === row!.id) || Date.now() - (row.seat_seen_at ?? 0) < PRACTICE_TIMING.seatStale);
      if (row.seat && holderActive) return { status: "taken" as const, by: row.client };
      const seat = randomId(9);
      const now = Date.now();
      // The turn first: a full practice refuses it before the seat changes hands.
      this.addTurn(row.id, "app", "joined", { client });
      this.sql.exec(
        "UPDATE practices SET seat = ?, client = ?, seat_seen_at = ?, state = CASE WHEN state = 'waiting' THEN 'live' ELSE state END, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?",
        seat,
        client,
        now,
        now,
        now,
        row.id,
      );
      joined = true;
      row = this.row(row.id)!;
      this.changed();
      await this.schedule();
    } else {
      this.sql.exec("UPDATE practices SET seat_seen_at = ? WHERE id = ?", Date.now(), row.id);
    }

    const seat = row.seat!;
    const practice = this.forAi(row);

    const after = Number.isInteger(input.after) ? Number(input.after) : row.ai_after;
    if (joined) {
      return { status: "joined" as const, practice, seat, learner: await this.getLearner(), turns: this.turns(row.id), after: this.deliver(row.id) };
    }
    let fresh = this.learnerTurnsAfter(row.id, after);
    if (!fresh.length) {
      const reason = await this.aiPark(row.id, seat, deadline - Date.now());
      const now = this.row(row.id);
      if (!now) return { status: "not_found" as const };
      if (reason === "superseded") return { status: "superseded" as const };
      if (now.state === "ended") return { status: "ended" as const, practice, seat, by: now.ended_by, why: now.end_why, summarized: now.summarized === 1 };
      fresh = this.learnerTurnsAfter(row.id, after);
      if (!fresh.length) {
        this.sweep();
        const swept = this.row(row.id);
        if (swept?.state === "ended") return { status: "ended" as const, practice, seat, by: swept.ended_by, why: swept.end_why, summarized: swept.summarized === 1 };
        return { status: "waiting" as const, practice: { id: row.id }, seat, after };
      }
    }
    return { status: "your_move" as const, practice: { id: row.id }, seat, turns: fresh, after: this.deliver(row.id) };
  }

  /** A practice's language: the one it started in (Dutch for one from before practices had one). */
  private languageOf(row: Row) {
    return (JSON.parse(row.settings) as Settings).language ?? "nl";
  }

  /**
   * Runs one synchronous step (a check, the AI's view) with the practice's language known: a learner's own is known only through the
   * definition the practice keeps, and only while fn runs, never across an await (12 Nov 2026). One of ours is known always.
   */
  private inLanguage<T>(row: Row, fn: () => T): T {
    const settings = JSON.parse(row.settings) as Settings;
    return withOwnLanguage(settings.language ?? "nl", settings.languageDef, fn) as T;
  }

  /**
   * A practice as the AI sees it: its settings with the kind's and the language's names, the language's locale, and their own language (from,
   * fromName: what the summary is written in; English for a practice from before it was kept).
   */
  private forAi(row: Row) {
    const settings = JSON.parse(row.settings) as Settings;
    const language = this.languageOf(row);
    const from = settings.from ?? "en";
    // A language of their own: its name and definition from the practice (languageDef: how it's written; no locale, no voice).
    return this.inLanguage(row, () => ({ id: row.id, ...settings, language, kindName: KINDS[settings.kind]?.name, languageName: languageName(language), locale: (LANGUAGES as Record<string, { locale: string } | undefined>)[language]?.locale, from, fromName: languageName(from) }));
  }

  private learnerTurnsAfter(id: string, after: number) {
    return this.turns(id, after).filter((t) => t.who === "you");
  }

  /** Marks everything up to now as seen by the AI; it's thinking from here until it replies. */
  private deliver(id: string): number {
    const seq = this.lastSeq(id);
    this.sql.exec("UPDATE practices SET ai_after = ?, delivered_at = ?, seat_seen_at = ? WHERE id = ?", seq, Date.now(), Date.now(), id);
    this.changed();
    return seq;
  }

  /** Holds the AI's call until something happens on `practiceId` (or a practice opens), or `ms` pass. */
  private aiPark(practiceId: string | null, seat: string | undefined, ms: number): Promise<string> {
    // The same AI calling again replaces its older wait (that call was most likely abandoned).
    const keep: Waiter<string>[] = [];
    for (const w of this.aiWaiters) {
      if (w.practiceId === practiceId && w.seat === seat) {
        clearTimeout(w.timer);
        w.resolve("superseded");
      } else keep.push(w);
    }
    this.aiWaiters = keep.slice(-8);
    return new Promise<string>((resolve) => {
      const waiter: Waiter<string> = {
        practiceId,
        seat,
        resolve: (reason) => {
          this.aiWaiters = this.aiWaiters.filter((w) => w !== waiter);
          resolve(reason);
          if (practiceId) this.changed();
        },
        timer: setTimeout(() => waiter.resolve("timeout"), Math.max(0, ms)),
      };
      this.aiWaiters.push(waiter);
      if (practiceId) this.changed(); // the app shows "here"
    });
  }

  /** A practice from the app, for the AI holding its seat alone: a session of the same app with no seat or another isn't it (Codex C18). */
  private seated(practiceId: string, seat: string | undefined): Row {
    const row = this.row(practiceId);
    if (!row) throw new PracticeError("No practice with that id is on the server.");
    if (row.mode === "app" && (!row.seat || row.seat !== seat)) {
      throw new PracticeError(
        seat
          ? "This practice is run by another AI session. Call practice_wait to join (it tells you if you can)."
          : "Give the seat practice_wait gave you. Without it, call practice_wait to join (it tells you if you can).",
      );
    }
    return row;
  }

  /** practice_reply. Returns its seq, what was left out and why, and whether the app is looking. */
  private async doAiReply(source: string, input: AiReplyInput) {
    const row = this.seated(input.practiceId, input.seat);
    if (row.state === "ended") throw new PracticeError("This practice has ended. Call practice_end with your summary.");
    if (row.mode === "inapp") throw new PracticeError("That practice is run by the app's own AI, on their device.");
    if (row.mode !== "app") throw new PracticeError("That practice was logged with practice_log; add to it with practice_log.");
    const seq = this.lastSeq(row.id) + 1;
    const { reply, notes } = this.inLanguage(row, () => {
      const reply = checkReply(input.reply, { cardId: `practice:${row.id}:${seq}`, language: this.languageOf(row) }) as { grades: Grade[]; [k: string]: unknown };
      return { reply, notes: this.placeGrades(row.id, reply.grades) };
    });
    const stored = this.addTurn(row.id, "ai", "reply", reply);
    this.sql.exec("UPDATE practices SET seat_seen_at = ? WHERE id = ?", Date.now(), row.id);
    this.changed();
    await this.schedule();
    return { seq: stored.seq, after: row.ai_after, leftOut: notes, appLooking: this.appWaiters.some((w) => w.practiceId === row.id) };
  }

  /**
   * Points each grade at the turn of yours it marks (the newest ungraded one when it doesn't say), and drops marks
   * whose words aren't in what you said, so the app never underlines something you didn't write (protocol.js placeGrades).
   */
  private placeGrades(id: string, grades: Grade[]): string[] {
    return placeGrades(this.turns(id), grades);
  }

  /** practice_end: ends the practice (if it hasn't) and stores your AI's summary. */
  private async doAiEnd(source: string, input: AiEndInput) {
    const row = this.seated(input.practiceId, input.seat);
    // The app's own AI runs it on their device, and ends it there: an AI over MCP can't end it or give it a summary (6 Nov 2026, Codex C18).
    if (row.mode === "inapp") throw new PracticeError("That practice is run by the app's own AI, on their device.");
    const summary = this.inLanguage(row, () => checkSummary(input.summary, { language: this.languageOf(row) }));
    if (row.state !== "ended") this.end(row, "ai", null);
    const existing = this.sql.exec<{ seq: number }>("SELECT seq FROM turns WHERE practice_id = ? AND type = 'summary'", row.id).toArray()[0];
    if (existing) this.sql.exec("DELETE FROM turns WHERE practice_id = ? AND seq = ?", row.id, existing.seq);
    const stored = this.addTurn(row.id, "ai", "summary", summary as Record<string, unknown>);
    // A summary that lands after the device collected the practice: the device collects it again.
    this.sql.exec("UPDATE practices SET summarized = 1, collected_at = NULL WHERE id = ?", row.id);
    this.changed();
    await this.schedule();
    return { seq: stored.seq };
  }

  /**
   * practice_log: a conversation held in your AI's own app (typed, or in voice mode), logged as it goes or after the
   * last message. The first call starts a practice; later calls add to it; done ends it.
   */
  private async doAiLog(source: string, input: AiLogInput) {
    const client = clientName(source);
    let row: Row | null = null;
    let settings: Settings | null = null;
    if (input.practiceId) {
      row = this.row(input.practiceId);
      if (!row || row.mode !== "ai") throw new PracticeError("No logged practice with that id is on the server. Leave practice_id out to start a new one.");
      if (row.state === "ended") throw new PracticeError("That logged practice has ended. Leave practice_id out to start a new one.");
    } else {
      // In the language the AI names, or the one their app last said they're learning; a language of their own with the definition their
      // app sent with it (learner.js), when it's that one.
      const learner = await this.getLearner();
      const said = learner ? (JSON.parse(learner.snapshot) as { language?: unknown; languageDef?: unknown }) : {};
      const learning = typeof said.language === "string" ? said.language : undefined;
      const language = input.language ?? learning;
      const languageDef = language !== undefined && language === learning ? said.languageDef : undefined;
      settings = checkSettings({ kind: input.kind ?? "conversation", answer: "both", minutes: 10, language, languageDef }) as Settings;
    }
    // Checked in the practice's language before anything is stored (a language of their own known for this step alone).
    const known = settings ?? (JSON.parse(row!.settings) as Settings);
    const language = known.language ?? "nl";
    const { turns, summary } = withOwnLanguage(language, known.languageDef, () => ({
      turns: checkLogTurns(input.turns, { language }) as (Record<string, unknown> & { who: Who; type: string; gradesPrevious?: boolean; grades?: Grade[] })[],
      summary: input.summary === undefined ? undefined : checkSummary(input.summary, { language }),
    }));
    if (!row) {
      const id = randomId(9);
      const now = Date.now();
      this.sql.exec(
        "INSERT INTO practices (id, settings, mode, state, client, created_at, started_at, updated_at) VALUES (?, ?, 'ai', 'live', ?, ?, ?, ?)",
        id,
        JSON.stringify(settings),
        client,
        now,
        now,
        now,
      );
      row = this.row(id)!;
    }
    // Room for these among the practice's own turns, before anything is stored; its end and the summary that ends it always have theirs
    // (addTurn), but a summary sent before the end counts as a turn, as it may come again.
    const taking = turns.length + (summary && !input.done ? 1 : 0);
    if (this.lastSeq(row.id) + taking > LIMITS.turns - CLOSING_TYPES.size) throw new PracticeError(`This logged practice is full (${LIMITS.turns} turns, with room kept for its end and summary): end it with practice_end and your summary, and log the rest in a new one.`);
    const seqs: number[] = [];
    let lastLearner: number | undefined;
    for (const turn of turns) {
      const { who, type, gradesPrevious, ...body } = turn;
      if (gradesPrevious && body.grades) {
        for (const grade of body.grades as Grade[]) grade.turn = lastLearner;
        this.placeGrades(row.id, body.grades as Grade[]);
      }
      const stored = this.addTurn(row.id, who, type, body);
      if (who === "you") lastLearner = stored.seq;
      seqs.push(stored.seq);
    }
    if (summary) {
      this.addTurn(row.id, "ai", "summary", summary as Record<string, unknown>);
      this.sql.exec("UPDATE practices SET summarized = 1 WHERE id = ?", row.id);
    }
    if (input.done) this.end(this.row(row.id)!, "ai", null);
    this.changed();
    await this.schedule();
    return { practiceId: row.id, seqs, ended: Boolean(input.done) };
  }
  // ---------- requests for the person's AI ----------

  private requestRow(id: string): RequestRow | null {
    return (this.sql.exec<RequestRow>("SELECT * FROM requests WHERE id = ?", id).toArray()[0] as RequestRow | undefined) ?? null;
  }

  private requestMeta(row: RequestRow): RequestMeta {
    return {
      ...(JSON.parse(row.body) as Record<string, unknown>),
      id: row.id,
      kind: row.kind,
      state: row.state as RequestMeta["state"],
      client: row.client,
      takenAt: row.taken_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      result: row.result ? (JSON.parse(row.result) as Record<string, unknown>) : null,
    };
  }

  private requestsChanged() {
    this.requestChanges++;
    const waiting = this.requestAppWaiters;
    this.requestAppWaiters = [];
    for (const w of waiting) {
      clearTimeout(w.timer);
      w.resolve();
    }
  }

  private requestsVersion() {
    return `${this.epoch}.r${this.requestChanges}`;
  }

  /** Waiting ones past 14 days expire; a taken one whose AI went quiet goes back; finished ones are forgotten. */
  private sweepRequests(now = Date.now()) {
    const expired = this.sql.exec("UPDATE requests SET state = 'expired', updated_at = ? WHERE state = 'waiting' AND created_at < ?", now, now - REQUEST_TIMING.expire).rowsWritten;
    const back = this.sql.exec("UPDATE requests SET state = 'waiting', client = NULL, seat = NULL, taken_at = NULL, updated_at = ? WHERE state = 'taken' AND taken_at < ?", now, now - REQUEST_TIMING.takenStale).rowsWritten;
    const gone = this.sql.exec("DELETE FROM requests WHERE state NOT IN ('waiting', 'taken') AND updated_at < ?", now - REQUEST_TIMING.keepFinished).rowsWritten;
    if (expired || back || gone) this.requestsChanged();
    if (back) this.wakeRequestWaiters();
  }

  private wakeRequestWaiters() {
    const waiting = this.requestWaiters;
    this.requestWaiters = [];
    for (const w of waiting) {
      clearTimeout(w.timer);
      w.resolve("request");
    }
  }

  /** An AI checked in for requests: the app's "last here" (the app hears of it when it's another AI, or a minute on). */
  private noteAi(source: string) {
    const before = this.aiSeen();
    const client = clientName(source);
    const now = Date.now();
    this.sql.exec("INSERT INTO ai_seen (id, client, at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET client = excluded.client, at = excluded.at", client, now);
    if (!before || before.client !== client || now - before.at >= 60_000) this.requestsChanged();
  }

  private aiSeen(): { client: string; at: number } | null {
    return (this.sql.exec<{ client: string; at: number }>("SELECT client, at FROM ai_seen WHERE id = 1").toArray()[0] as { client: string; at: number } | undefined) ?? null;
  }

  /** Every request still open (at most REQUEST_LIMITS.open), and the 60 finished most recently: newest first. */
  private listRequestRows(): RequestRow[] {
    const open = this.sql.exec<RequestRow>("SELECT * FROM requests WHERE state IN ('waiting', 'taken')").toArray() as RequestRow[];
    const finished = this.sql.exec<RequestRow>("SELECT * FROM requests WHERE state NOT IN ('waiting', 'taken') ORDER BY updated_at DESC LIMIT 60").toArray() as RequestRow[];
    return [...open, ...finished].sort((a, b) => b.created_at - a.created_at);
  }

  /** A request from the app: checked, kept, and any AI waiting for one hears of it at once. */
  private async doCreateRequest(input: unknown): Promise<RequestMeta> {
    this.sweepRequests();
    // A question about a pattern names one of its language's shared grammar, as the library has it now (src/grammar.ts).
    const about = (input as { about?: { language?: unknown } } | null)?.about;
    await grammarReady(this.env, typeof about === "object" && about ? about.language : undefined);
    const { kind, ...body } = checkRequest(input) as { kind: string } & Record<string, unknown>;
    const open = Number(this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM requests WHERE state IN ('waiting', 'taken')").one().n);
    if (open >= REQUEST_LIMITS.open) throw new PracticeError(`${REQUEST_LIMITS.open} requests are already waiting for your AI. Cancel one, or let it catch up.`);
    const id = randomId(9);
    const now = Date.now();
    this.sql.exec("INSERT INTO requests (id, kind, body, state, created_at, updated_at) VALUES (?, ?, ?, 'waiting', ?, ?)", id, kind, JSON.stringify(body), now, now);
    this.wakeRequestWaiters();
    this.requestsChanged();
    await this.schedule();
    return this.requestMeta(this.requestRow(id)!);
  }

  /** The app's view of the requests: answers at once when they changed since `version`, else when they do. */
  async requestsPoll(version: string | null, waitMs: number) {
    this.sweepRequests();
    // Waits past the cap (six open tabs) are answered at once with busy, and the app waits before asking again.
    const busy = version === this.requestsVersion() && waitMs > 0 && this.requestAppWaiters.length >= REQUEST_WAITS.app;
    if (version === this.requestsVersion() && waitMs > 0 && !busy) {
      await new Promise<void>((resolve) => {
        const waiter: Waiter<void> = {
          practiceId: null,
          resolve: () => {
            clearTimeout(waiter.timer);
            this.requestAppWaiters = this.requestAppWaiters.filter((w) => w !== waiter);
            resolve();
          },
          timer: setTimeout(() => waiter.resolve(), Math.min(waitMs, PRACTICE_TIMING.appWaitMax)),
        };
        this.requestAppWaiters.push(waiter);
      });
    }
    return { version: this.requestsVersion(), now: Date.now(), requests: this.listRequestRows().map((row) => this.requestMeta(row)), ai: this.aiSeen(), ...(busy ? { busy: true } : {}) };
  }

  /** list_requests: every request still kept, newest first; the AI asking counts as it checking in. */
  async aiListRequests(source: string): Promise<RequestMeta[]> {
    this.sweepRequests();
    this.noteAi(source);
    return this.listRequestRows().map((row) => this.requestMeta(row));
  }

  private async doCancelRequest(id: string): Promise<RequestMeta> {
    const row = this.requestRow(id);
    if (!row) throw new PracticeError("That request isn't here any more.");
    if (row.state !== "waiting") throw new PracticeError(row.state === "taken" ? `${row.client ?? "Your AI"} is already on it.` : "That request has finished.");
    this.sql.exec("UPDATE requests SET state = 'canceled', updated_at = ? WHERE id = ?", Date.now(), id);
    this.requestsChanged();
    await this.schedule();
    return this.requestMeta(this.requestRow(id)!);
  }

  /**
   * take_request: the AI takes a waiting request, and gets a seat for finishing it. Ownership is the seat alone (two
   * sessions of the same AI share a name): with its seat, a request already taken comes back to it. A practice starts
   * at once, as the app would start it, and the request is done.
   */
  private async doAiTakeRequest(source: string, id: string, resume?: string) {
    this.sweepRequests();
    this.noteAi(source);
    const client = clientName(source);
    const row = this.requestRow(id);
    if (!row) throw new PracticeError("No request has that id (list_requests lists them).");
    if (row.state === "taken" && resume && row.seat === resume) return { request: this.requestMeta(row), seat: row.seat };
    if (row.state !== "waiting") throw new PracticeError(row.state === "taken" ? `${row.client ?? "Another AI"} has taken it.` : `That request is ${row.state}.`);
    const seat = randomId(9);
    if (row.kind === "practice") {
      // Starting a practice ends the one open; a request left earlier never cuts off one going on now.
      // Any practice going on: one with an AI over MCP, or the app's own AI's (doCreate ends either; 6 Nov 2026, Codex C18).
      if (this.openAppRow()) throw new PracticeError("A practice is going on in their app right now, so this one can't start: join that one with practice_wait, or take this request once it has ended. It stays waiting.");
      // The practice first: if it can't start, the request stays waiting, untouched.
      const practice = await this.doCreate((JSON.parse(row.body) as { practice: unknown }).practice, null);
      const now = Date.now();
      const result = { said: "Started the practice", links: { practice: practice.id } };
      this.sql.exec("UPDATE requests SET state = 'done', client = ?, seat = ?, taken_at = ?, result = ?, updated_at = ? WHERE id = ?", client, seat, now, JSON.stringify(result), now, id);
      this.requestsChanged();
      await this.schedule();
      return { request: this.requestMeta(this.requestRow(id)!), seat, practice: this.forAi(this.row(practice.id)!) };
    }
    const now = Date.now();
    this.sql.exec("UPDATE requests SET state = 'taken', client = ?, seat = ?, taken_at = ?, updated_at = ? WHERE id = ? AND state = 'waiting'", client, seat, now, now, id);
    this.requestsChanged();
    await this.schedule();
    return { request: this.requestMeta(this.requestRow(id)!), seat };
  }

  /** finish_request: done (what it did, links), couldn't (why), or an answer. Only the AI that took it, by its seat. */
  private async doAiFinishRequest(source: string, id: string, seat: string | undefined, input: unknown) {
    this.noteAi(source);
    const row = this.requestRow(id);
    if (!row) throw new PracticeError("No request has that id (list_requests lists them).");
    if (row.state !== "taken") throw new PracticeError(row.state === "waiting" ? "Take it first (take_request)." : `That request is ${row.state} already.`);
    if (!seat || row.seat !== seat) throw new PracticeError(seat ? "That isn't the seat take_request gave you for this request." : "Give the seat take_request gave you for this request.");
    const { state, ...result } = checkFinish(input, row.kind) as { state: string } & Record<string, unknown>;
    this.sql.exec("UPDATE requests SET state = ?, result = ?, updated_at = ? WHERE id = ?", state, JSON.stringify(result), Date.now(), id);
    this.requestsChanged();
    await this.schedule();
    return this.requestMeta(this.requestRow(id)!);
  }

  /** wait_for_request: the oldest waiting request now, or the first one made within waitMs. */
  private async doAiWaitRequest(source: string, waitMs: number) {
    const ms = Math.max(1000, Math.min(waitMs || PRACTICE_TIMING.aiWaitDefault, PRACTICE_TIMING.aiWaitMax));
    const oldest = () => (this.sql.exec<RequestRow>("SELECT * FROM requests WHERE state = 'waiting' ORDER BY created_at LIMIT 1").toArray()[0] as RequestRow | undefined) ?? null;
    this.sweepRequests();
    this.noteAi(source);
    let row = oldest();
    if (!row && this.requestWaiters.length >= REQUEST_WAITS.ai) throw new PracticeError(`${REQUEST_WAITS.ai} waits are open already; call wait_for_request again in a few seconds.`);
    if (!row) {
      await new Promise<string>((resolve) => {
        const waiter: Waiter<string> = {
          practiceId: null,
          seat: clientName(source),
          resolve: (reason) => {
            clearTimeout(waiter.timer);
            this.requestWaiters = this.requestWaiters.filter((w) => w !== waiter);
            resolve(reason);
          },
          timer: setTimeout(() => waiter.resolve("timeout"), ms),
        };
        this.requestWaiters.push(waiter);
      });
      row = oldest();
    }
    return row ? { status: "request" as const, request: this.requestMeta(row) } : { status: "none" as const };
  }

  // ---------- what the Worker calls (RPC): a PracticeError comes back as { error } ----------

  create(input: unknown, snapshot: unknown) {
    return attempt(() => this.doCreate(input, snapshot));
  }
  learnerTurn(id: string, input: unknown) {
    return attempt(() => this.doLearnerTurn(id, input));
  }
  endFromApp(id: string) {
    return attempt(() => this.doEndFromApp(id));
  }
  appReply(id: string, input: unknown) {
    return attempt(() => this.doAppReply(id, input));
  }
  appSummary(id: string, input: unknown) {
    return attempt(() => this.doAppSummary(id, input));
  }
  putLearner(snapshot: unknown) {
    return attempt(() => this.storeLearner(snapshot));
  }
  aiWait(source: string, input: AiWaitInput) {
    return attempt(() => this.doAiWait(source, input));
  }
  aiReply(source: string, input: AiReplyInput) {
    return attempt(() => this.doAiReply(source, input));
  }
  aiEnd(source: string, input: AiEndInput) {
    return attempt(() => this.doAiEnd(source, input));
  }
  aiLog(source: string, input: AiLogInput) {
    return attempt(() => this.doAiLog(source, input));
  }
  createRequest(input: unknown) {
    return attempt(() => this.doCreateRequest(input));
  }
  cancelRequest(id: string) {
    return attempt(() => this.doCancelRequest(id));
  }
  aiTakeRequest(source: string, id: string, resume?: string) {
    return attempt(() => this.doAiTakeRequest(source, id, resume));
  }
  aiFinishRequest(source: string, id: string, seat: string | undefined, input: unknown) {
    return attempt(() => this.doAiFinishRequest(source, id, seat, input));
  }
  aiWaitRequest(source: string, waitMs: number) {
    return attempt(() => this.doAiWaitRequest(source, waitMs));
  }
}

type Grade = { turn?: number; marks: { said: string; fix?: string }[]; [k: string]: unknown };

/** The account's practice room. */
export const practiceRoom = (env: Env, userId: string) => env.PRACTICE.getByName(userId);
