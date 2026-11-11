// The in-app AI, running a practice in the room (room.js): this device asks for the AI's reply whenever one is due, shows its
// lines as they come, checks it as your own AI's are checked (ai/inapp.js, protocol.js) and hands it to the practice room,
// which checks it again, places its grades and keeps it like any reply. Who's asked is the practice's engine:
//   - "own-key": the provider, straight from here, with a key of your own (ai/own-key.js); Lexicommons gets the reply, never the key;
//   - "plan": Lexicommons (ai/hosted.js), which builds the request from the room and asks on its own key.
// A reply is due when the practice has no reply yet, after a turn of yours, or after a reply that said it goes on
// (expect: none). One at a time; if you said more while it was being made, the room says so (stale) and it's made again.

import { INAPP, REPLY_SCHEMA, SUMMARY_SCHEMA, chatBody, finishReply, finishSummary, modelJson, practiceMessages, readChat, replyBody, sayWatcher, summaryMessages } from "../ai/inapp.js";
import { callProvider, keySummary, noteUsage } from "../ai/own-key.js";
import { HOSTED_NAME, hostedStream } from "../ai/hosted.js";
import { whoAmI, post } from "../shell/api.js";
import { learnerSnapshot } from "./learner.js";

/** The last turn that isn't the app's own (joined, ended, a note). */
const lastSaid = (turns) => [...turns].reverse().find((t) => t.who !== "app");

/** Whether the AI owes a reply now. */
export function replyDue(turns) {
  const last = lastSaid(turns);
  return !last || last.who === "you" || (last.who === "ai" && last.type === "reply" && last.expect === "none");
}

/**
 * runs a practice's AI side on this device. on: { start(), lines(lines), done(), error(message, retry, code) }: code is the server's
 * (ai/hosted.js: "used_up" and the rest); retry(practice?) asks again, on the practice as it is now when given one (its engine switched).
 * consider(practice, turns) after every change; summarize(practice, turns) once it has ended; stop() when the room closes.
 */
export function inappRunner(practiceId, on) {
  let running = false;
  let controller = null;
  let failedAt = null; // the turns' last seq when a reply failed: not tried again on its own until something changes
  let held = -1; // a reply went (or the room said "stale") after this seq: nothing more until a later turn is seen
  let summarizing = false;
  let stopped = false;

  /** Reads an answer as it streams, a reply's lines shown the moment each is whole; who: the name its errors go under. */
  async function readAnswer(response, name, who) {
    const watcher = name === "reply" ? sayWatcher() : null;
    const seen = [];
    const result = await readChat(response.body, {
      onText: (text) => {
        if (!watcher) return;
        const fresh = watcher.push(text);
        if (fresh.length) {
          seen.push(...fresh);
          on.lines?.([...seen]);
        }
      },
    });
    if (result.error) throw new Error(`${who}: ${result.error}`);
    if (!result.done && !result.text) throw new Error(`${who} stopped before answering. Try again.`);
    return result;
  }

  /** A key of your own: the request built here, sent straight to its provider. */
  async function ask(messages, schema, name, maxTokens) {
    const me = await whoAmI();
    const key = await keySummary(me.user.id);
    if (!key) throw new Error("There's no key on this device for this account any more. Add it again in the AI section.");
    controller = new AbortController();
    const body = chatBody({ provider: key.provider, model: key.model.id, effort: key.model.effort, messages, schema, name, maxTokens });
    const response = await callProvider(me.user.id, body, { signal: controller.signal });
    const result = await readAnswer(response, name, key.providerName);
    noteUsage(result.usage);
    return result.text;
  }

  /** The plan: Lexicommons builds the request from the room and streams the answer back. */
  async function askHosted(kind, body) {
    controller = new AbortController();
    const response = await hostedStream(kind, body, { signal: controller.signal });
    return (await readAnswer(response, kind, HOSTED_NAME)).text;
  }

  async function reply(practice, turns, { retry = false } = {}) {
    if (running || stopped) return;
    const after = Math.max(0, ...turns.map((t) => t.seq));
    if (after <= held) return;
    if (!retry && failedAt === after) return;
    running = true;
    on.start?.();
    try {
      const make =
        practice.engine === "plan"
          ? () => askHosted("reply", { practice: practiceId, after })
          : () => ask(practiceMessages({ practice: practice.settings, learner: learnerSnapshot(), turns }), REPLY_SCHEMA, "reply", INAPP.maxTokens.reply);
      let text = await make();
      try {
        finishReply(text, { language: practice.settings.language });
      } catch {
        // Once more: a model's slip is usually one-off. A second bad reply is said in words.
        text = await make();
        finishReply(text, { language: practice.settings.language });
      }
      const answer = await post(`/api/practice/${encodeURIComponent(practiceId)}/reply`, { after, reply: replyBody(text, practice.settings.language) });
      // Sent, or stale (you said more meanwhile): either way the next move waits for turns past this one.
      held = after;
      failedAt = null;
      running = false;
      on.done?.(answer);
    } catch (error) {
      running = false;
      if (stopped || error.name === "AbortError") return;
      if (error.code === "stale") {
        // You said more before it was asked: the next move waits for the turns past this one, as with the room's own stale.
        held = after;
        on.done?.(null);
        return;
      }
      failedAt = after;
      on.error?.(error.message, (next) => reply(next ?? practice, turns, { retry: true }), error.code);
    }
  }

  async function summarize(practice, turns) {
    if (summarizing || stopped || practice.summarized) return;
    summarizing = true;
    on.start?.();
    try {
      const text =
        practice.engine === "plan"
          ? await askHosted("summary", { practice: practiceId })
          : await ask(summaryMessages({ practice: practice.settings, learner: learnerSnapshot(), turns }), SUMMARY_SCHEMA, "summary", INAPP.maxTokens.summary);
      finishSummary(text, { language: practice.settings.language });
      await post(`/api/practice/${encodeURIComponent(practiceId)}/summary`, { summary: modelJson(text) });
      on.done?.(null);
    } catch (error) {
      summarizing = false;
      if (stopped || error.name === "AbortError") return;
      on.error?.(error.message, (next) => summarize(next ?? practice, turns), error.code);
    }
  }

  return {
    get running() {
      return running || summarizing;
    },
    consider(practice, turns) {
      if (practice.mode !== "inapp" || practice.state === "ended") return;
      if (replyDue(turns)) reply(practice, turns);
    },
    summarize(practice, turns) {
      if (practice.mode === "inapp" && practice.state === "ended") summarize(practice, turns);
    },
    stop() {
      stopped = true;
      controller?.abort();
    },
  };
}
