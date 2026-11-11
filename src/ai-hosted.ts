// The in-app AI on Lexicommons' own key, for an account on the plan (billing.ts): a practice's replies and its summary, and
// Translate with AI, made here through OpenRouter. Never packs, texts or looks: those stay with your own AI over MCP.
//
// The requests are the ones a key of your own makes (public/js/ai/inapp.js), built here from what the practice room holds, so the
// device never sends a system prompt: ZDR and no data collection on every one, an opaque tag for the account (never its id).
//
// Metered in OpenRouter's own reported cost (usage.cost), in micro-dollars, per calendar month (UTC):
//   - Before a call, one conditional write reserves its worst case (every character a token at the input price, plus the
//     most it may write at the output price), only while the month's spent and reserved leave room for it, and only while
//     no other call of the account's is out: one at a time.
//   - After it, the call settles at what it cost. A stream that ends without its cost is looked up in OpenRouter's record of
//     the call; with none, it's charged its worst case. A call whose Worker died is charged its worst case by the account's
//     next call, once its time is past, and corrected if it settles after all.
// The ledger (ai_usage) keeps tokens and cost, never what was said; it goes with the account and is in its export.
import type { Env } from "./env";
import { entitlement, planOffered } from "./billing";
import type { PracticeMeta } from "./practice";
import { hmacHex } from "./util";
import {
  INAPP,
  REPLY_SCHEMA,
  SUMMARY_SCHEMA,
  TRANSLATION_SCHEMA,
  chatBody,
  finishTranslation,
  practiceMessages,
  readChat,
  summaryMessages,
  tokensAtMost,
  translateMessages,
} from "../public/js/ai/inapp.js";
import { PracticeError } from "../public/js/practice/protocol.js";

export const HOSTED = {
  model: "openai/gpt-6-luna", // chosen by the bake-off on 5 Nov 2026, at reasoning effort low
  effort: "low",
  name: "Lexicommons AI",
  // OpenRouter's price for that model on 5 Nov 2026, in micro-dollars a token ($0.10 and $0.50 a million). Only the worst case
  // reserved before a call uses these: a call is charged what OpenRouter says it cost.
  price: { input: 0.1, output: 0.5 },
  busyMs: 180_000, // a call this old with no settling is taken as dead
  lookupWaits: [2_000, 5_000, 10_000], // a stream that ended without its cost: OpenRouter's record of it, asked after these
  busyWaits: [250, 500, 1_000, 1_500], // a call while the last still settles: asked again after these (it settles moments after its stream)
  timeoutMs: 120_000,
};

export class HostedError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Whether this site offers the in-app AI on its own key: the plan, and the provider's key. */
export const hostedOffered = (env: Env) => planOffered(env) && Boolean(env.OPENROUTER_API_KEY);

const local = (env: Env) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.PUBLIC_ORIGIN);
const apiBase = (env: Env) => (local(env) && env.OPENROUTER_API_BASE ? env.OPENROUTER_API_BASE : "https://openrouter.ai");
const monthOf = (now: number) => new Date(now).toISOString().slice(0, 7);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nextMonth = (now: number) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

/** The worst a call can cost, in micro-dollars: every character a token in, and the most it may write out. */
export const worstCase = (messages: unknown, maxTokens: number) => Math.ceil(tokensAtMost(messages) * HOSTED.price.input + maxTokens * HOSTED.price.output);

/** This month's use: { month, allowance, spent, reserved, resets } (micro-dollars; resets in ms). */
export async function meterOf(env: Env, userId: string, now = Date.now()) {
  const month = monthOf(now);
  const row = await env.DB.prepare("SELECT allowance, spent, reserved FROM ai_meter WHERE user_id = ? AND month = ?").bind(userId, month).first<{ allowance: number; spent: number; reserved: number }>();
  return { month, spent: row?.spent ?? 0, reserved: row?.reserved ?? 0, resets: nextMonth(now) };
}

type Call = { userId: string; month: string; worst: number; token: number; feature: string };

/**
 * Reserves a call's worst case, or says why not (HostedError: busy, or the month's allowance used). A call that comes while the
 * last is still settling (you typed while it was answering) is asked again after HOSTED.busyWaits before it's refused as busy.
 */
export async function reserve(env: Env, userId: string, allowance: number, worst: number, feature: string, now = Date.now()): Promise<Call> {
  const month = monthOf(now);
  const started = Date.now();
  for (let tries = 0; ; tries++) {
    const at = now + (Date.now() - started);
    const token = at + HOSTED.busyMs;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ai_meter (user_id, month, allowance) VALUES (?, ?, ?) ON CONFLICT (user_id, month) DO UPDATE SET allowance = excluded.allowance").bind(userId, month, allowance),
      // A call that never settled (its Worker gone) is charged its worst case, never forgiven.
      env.DB.prepare("UPDATE ai_meter SET spent = spent + reserved, reserved = 0 WHERE user_id = ? AND month = ? AND reserved > 0 AND busy_until < ?").bind(userId, month, at),
    ]);
    const taken = await env.DB.prepare(
      "UPDATE ai_meter SET reserved = ?, busy_until = ? WHERE user_id = ? AND month = ? AND reserved = 0 AND busy_until < ? AND spent + ? <= allowance",
    )
      .bind(worst, token, userId, month, at, worst)
      .run();
    if (taken.meta.changes) return { userId, month, worst, token, feature };
    const row = await env.DB.prepare("SELECT busy_until FROM ai_meter WHERE user_id = ? AND month = ?").bind(userId, month).first<{ busy_until: number }>();
    if (!row || row.busy_until < at) break; // not busy: the month's allowance doesn't hold it
    const wait = HOSTED.busyWaits[tries];
    if (wait === undefined) throw new HostedError("The AI is still answering. Try again in a moment.", 429, "busy");
    await sleep(wait);
  }
  const resets = nextMonth(now);
  // The month and its day never apart on a line (a non-breaking space between them).
  const day = new Date(resets).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).replace(" ", "\u00a0");
  throw new HostedError(`You've used this month's included AI. It's back on ${day}.`, 402, "used_up", { resets });
}

type Usage = { cost?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } } | null;
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

/** Settles a call at what it cost (micro-dollars, or its worst case when that's unknown), and writes the ledger. */
export async function settle(env: Env, call: Call, { cost, usage = null, generation = null }: { cost: number | null; usage?: Usage; generation?: string | null }, now = Date.now()) {
  const micro = cost === null ? call.worst : Math.max(0, Math.round(cost));
  const ours = await env.DB.prepare("UPDATE ai_meter SET spent = spent + ?, reserved = 0, busy_until = 0 WHERE user_id = ? AND month = ? AND busy_until = ? AND reserved = ?")
    .bind(micro, call.userId, call.month, call.token, call.worst)
    .run();
  // Not ours any more: the next call took it as dead and charged its worst case. Put that right.
  if (!ours.meta.changes) await env.DB.prepare("UPDATE ai_meter SET spent = MAX(0, spent + ? - ?) WHERE user_id = ? AND month = ?").bind(micro, call.worst, call.userId, call.month).run();
  if (micro > 0 || usage) {
    await env.DB.prepare(
      "INSERT INTO ai_usage (user_id, at, feature, model, prompt_tokens, cached_tokens, completion_tokens, cost_micro, generation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(call.userId, now, call.feature, HOSTED.model, count(usage?.prompt_tokens), count(usage?.prompt_tokens_details?.cached_tokens), count(usage?.completion_tokens), micro, generation)
      .run();
  }
}

/** OpenRouter's own record of a call, for its cost in micro-dollars: null if it hasn't one (yet). */
async function lookupCost(env: Env, generation: string): Promise<number | null> {
  try {
    const response = await fetch(`${apiBase(env)}/api/v1/generation?id=${encodeURIComponent(generation)}`, { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { total_cost?: unknown } };
    const dollars = body?.data?.total_cost;
    return typeof dollars === "number" && Number.isFinite(dollars) && dollars >= 0 ? dollars * 1e6 : null;
  } catch {
    return null;
  }
}


/** Reads a call's stream to its end and settles it: by its usage, else OpenRouter's record, else its worst case. */
type Read = { text: string; done: boolean; usage: Usage; id: string | null; error: string | null };
async function meterStream(env: Env, call: Call, stream: ReadableStream<Uint8Array>, waits = HOSTED.lookupWaits): Promise<Read | null> {
  let result: Read | null = null;
  // What the stream said before it broke (its id, any usage), kept so a broken call is settled by its own record, not its worst case.
  const partial = {} as Read;
  try {
    result = (await readChat(stream, { into: partial })) as Read;
  } catch {
    // A broken stream: what was made before it broke is still the provider's to charge.
    result = partial.id || partial.usage ? partial : null;
  }
  const dollars = result?.usage?.cost;
  const reported = typeof dollars === "number" && Number.isFinite(dollars) && dollars >= 0 ? dollars * 1e6 : null;
  let cost = reported;
  if (cost === null && result?.id) {
    for (const wait of waits) {
      await sleep(wait);
      cost = await lookupCost(env, result.id);
      if (cost !== null) break;
    }
  }
  await settle(env, call, { cost, usage: result?.usage ?? null, generation: result?.id ?? null });
  return result;
}

/** The account's opaque tag for the provider's abuse tools: never its id or name, the same every time. */
const userTag = async (env: Env, userId: string) => (await hmacHex(env.UPLOAD_SIGNING_SECRET, `ai-user:${userId}`)).slice(0, 32);

/** Calls OpenRouter with a request built here, streaming. */
async function callProvider(env: Env, userId: string, { messages, schema, name, maxTokens }: { messages: unknown[]; schema: object; name: string; maxTokens: number }) {
  const body = chatBody({ provider: "openrouter", model: HOSTED.model, effort: HOSTED.effort, messages, schema, name, maxTokens, user: await userTag(env, userId) });
  return fetch(`${apiBase(env)}/api/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://lexicommons.com", "X-Title": "Lexicommons" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HOSTED.timeoutMs),
  });
}

/**
 * This month's allowance from a plan (entitlement): the plan's each month; a trial's is for the whole trial, so a trial running into
 * a new month gets only what it hasn't used in the months before.
 */
export async function allowanceNow(env: Env, userId: string, plan: { trial: boolean; trialStart?: number | null; ai: { allowance: number } }, now = Date.now()) {
  if (!plan.trial || !plan.trialStart) return plan.ai.allowance;
  const earlier = await env.DB.prepare("SELECT COALESCE(SUM(spent + reserved), 0) AS n FROM ai_meter WHERE user_id = ? AND month >= ? AND month < ?")
    .bind(userId, monthOf(plan.trialStart), monthOf(now))
    .first<{ n: number }>();
  return Math.max(0, plan.ai.allowance - (earlier?.n ?? 0));
}

/** The plan's allowance for this account now, or why it has none. */
async function allowanceOf(env: Env, userId: string) {
  if (!hostedOffered(env)) throw new HostedError("The in-app AI isn't offered here.", 404, "not_offered");
  const plan = await entitlement(env, userId);
  if (!plan?.active || !(plan.ai.allowance > 0)) throw new HostedError("The in-app AI comes with the plan, and this account doesn't have it right now.", 402, "no_plan");
  return allowanceNow(env, userId, plan);
}

type Ctx = { waitUntil(promise: Promise<unknown>): void };
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** What a practice holds, for its in-app AI: its settings, every turn, and the learner summary the room keeps. */
async function practiceFor(env: Env, userId: string, id: unknown) {
  if (typeof id !== "string" || !id || id.length > 40) throw new HostedError("Which practice?", 400, "bad_request");
  const room = env.PRACTICE.getByName(userId); // practice.ts practiceRoom, without loading the room's class here
  const polled = (await room.poll(id, 0, null, 0)) as { gone: true } | { practice: PracticeMeta; turns: unknown[] };
  if ("gone" in polled) throw new HostedError("That practice isn't on the server any more.", 404, "gone");
  const { practice, turns } = polled;
  if (practice.mode !== "inapp" || practice.engine !== "plan") throw new HostedError("That practice isn't one the in-app AI runs on the plan.", 400, "not_hosted");
  const stored = await room.getLearner();
  let learner: unknown = null;
  try {
    learner = stored ? JSON.parse(stored.snapshot) : null;
  } catch {
    learner = null;
  }
  return { practice, turns, learner };
}

/**
 * The AI's next reply in a practice the plan runs: { practice, after } (after: the last turn the device has seen). Answers
 * with the provider's stream as it comes (text/event-stream); the device shows it, checks it and hands it to the room, as with
 * a key of its own. When there's been a turn since `after`, nothing is called: 409 { stale, after }.
 */
export async function hostedReply(env: Env, ctx: Ctx, userId: string, input: unknown): Promise<Response> {
  const allowance = await allowanceOf(env, userId);
  const body = isObject(input) ? input : {};
  const { practice, turns, learner } = await practiceFor(env, userId, body.practice);
  if (practice.state === "ended") throw new HostedError("This practice has ended.", 400, "ended");
  if (body.after !== practice.lastSeq) throw new HostedError("There's been a turn since.", 409, "stale", { stale: true, after: practice.lastSeq });
  const messages = practiceMessages({ practice: practice.settings, learner, turns });
  return stream(env, ctx, userId, allowance, "reply", { messages, schema: REPLY_SCHEMA, name: "reply", maxTokens: INAPP.maxTokens.reply });
}

/** The practice's summary, once it has ended and has none yet: the provider's stream, as hostedReply. */
export async function hostedSummary(env: Env, ctx: Ctx, userId: string, input: unknown): Promise<Response> {
  const allowance = await allowanceOf(env, userId);
  const body = isObject(input) ? input : {};
  const { practice, turns, learner } = await practiceFor(env, userId, body.practice);
  if (practice.state !== "ended") throw new HostedError("The summary comes once the practice has ended.", 400, "not_ended");
  if (practice.summarized) throw new HostedError("This practice has its summary.", 409, "summarized");
  const messages = summaryMessages({ practice: practice.settings, learner, turns });
  return stream(env, ctx, userId, allowance, "summary", { messages, schema: SUMMARY_SCHEMA, name: "summary", maxTokens: INAPP.maxTokens.summary });
}

async function stream(env: Env, ctx: Ctx, userId: string, allowance: number, feature: string, request: { messages: unknown[]; schema: object; name: string; maxTokens: number }) {
  const call = await reserve(env, userId, allowance, worstCase(request.messages, request.maxTokens), feature);
  let upstream: Response;
  try {
    upstream = await callProvider(env, userId, request);
  } catch {
    await settle(env, call, { cost: 0 });
    throw new HostedError("The AI didn't answer. Try again.", 502, "provider");
  }
  if (!upstream.ok || !upstream.body) {
    // Refused before it made anything (OpenRouter charges nothing for that).
    await settle(env, call, { cost: 0 });
    throw new HostedError("The AI didn't answer. Try again.", 502, "provider", { provider: upstream.status });
  }
  // One copy for the device, one read here to the end for the meter, whether or not the device stays to the end.
  const [toDevice, toMeter] = upstream.body.tee();
  ctx.waitUntil(meterStream(env, call, toMeter).catch(() => {}));
  return new Response(toDevice, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Translate with AI: { from, to, text, learning } → { translation, literal, note, alternatives }, checked. Read to its end
 * here and settled before it answers.
 */
export async function hostedTranslate(env: Env, userId: string, input: unknown) {
  const allowance = await allowanceOf(env, userId);
  const body = isObject(input) ? input : {};
  let messages: unknown[];
  try {
    messages = translateMessages({ from: body.from, to: body.to, text: body.text, learning: body.learning ?? body.to });
  } catch (error) {
    throw new HostedError(error instanceof PracticeError ? error.message : "Type something to translate.", 400, "bad_request");
  }
  const call = await reserve(env, userId, allowance, worstCase(messages, INAPP.maxTokens.translate), "translate");
  let upstream: Response;
  try {
    upstream = await callProvider(env, userId, { messages, schema: TRANSLATION_SCHEMA, name: "translation", maxTokens: INAPP.maxTokens.translate });
  } catch {
    await settle(env, call, { cost: 0 });
    throw new HostedError("The AI didn't answer. Try again.", 502, "provider");
  }
  if (!upstream.ok || !upstream.body) {
    await settle(env, call, { cost: 0 });
    throw new HostedError("The AI didn't answer. Try again.", 502, "provider", { provider: upstream.status });
  }
  const result = await meterStream(env, call, upstream.body);
  if (!result?.text) throw new HostedError("The AI didn't answer. Try again.", 502, "provider");
  try {
    return finishTranslation(result.text);
  } catch {
    throw new HostedError("The AI's answer came back broken. Try again.", 502, "broken");
  }
}
