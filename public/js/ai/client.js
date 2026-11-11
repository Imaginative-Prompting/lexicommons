// The app's side of requests for your AI (what a request is: ./requests.js; where they wait: the account's AI room,
// src/practice.ts, over /api/ai/requests). The AI tab's screens build on this: leave one, cancel one still waiting, and
// follow them all live, with the words for where each is and links to what your AI made.

import { api, post } from "../shell/api.js";
import { learning, learningFrom } from "../study/learning.js";
import { REQUEST_KINDS, REQUEST_TIMING, answerParts, describeAsk as describeAskChecked, describeRequest } from "./requests.js";

export { REQUEST_KINDS, answerParts, describeRequest };

/**
 * Leaves a request for your AI: { kind, …what it carries } (requests.js; a practice's language, and a question's
 * about.language, default to the one you're learning). A question asked from somewhere in the app carries about:
 * { where?, sentence?, game?, answer?, right?, word?, unit?, book?, translate? } (requests.js checkAbout). Resolves to
 * the request; throws an Error whose message can be shown as it is.
 */
export function createRequest(input) {
  return post("/api/ai/requests", withLanguage(input));
}

function withLanguage(input) {
  if (input?.kind === "practice") return { ...input, practice: { language: learning(), from: learningFrom(), ...input.practice } };
  if (input?.kind === "ask" && input.about) return { ...input, about: { language: learning(), ...input.about } };
  return input;
}

/** "Copy the question": a question ({ what, about? }, as createRequest takes it) as text to paste into any AI. */
export const describeAsk = (input) => describeAskChecked(withLanguage({ ...input, kind: "ask" }));

/**
 * Asks your AI to weave a text of yours into `language` (a "weave" request): the text goes up first, kept on the account for
 * that request only (src: POST /api/ai/weave-texts; deleted once the request is done, couldn't or canceled, or unused after an
 * hour), then the request names it. book: the text as read/store.js keeps it. Resolves to the request; throws an Error whose
 * message can be shown as it is.
 */
export async function askToWeave(book, language) {
  const { upload } = await post("/api/ai/weave-texts", { book });
  return createRequest({ kind: "weave", book: book.id, title: book.title || "Untitled", language, upload });
}

/** Cancels a request no AI has taken yet. */
export const cancelRequest = (id) => post(`/api/ai/requests/${encodeURIComponent(id)}/cancel`);

// The last answer, kept on this device for each account (localStorage "lx.ai-requests.v1": the newest requests and
// when an AI last checked in): the AI tab shows it at once, as it was, until the server's answer comes, so it never says
// "No AI connected yet" to someone whose AI is. Deleting the account takes it with every other "lx." key (Settings).
const KEPT_KEY = "lx.ai-requests.v1";
const KEPT_REQUESTS = 12;
let account = null;

/** Whose answers this device keeps (the signed-in account's id). */
export function setAiAccount(id) {
  account = id;
}

function keptAll() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEPT_KEY) ?? "null");
    if (saved && typeof saved.accounts === "object" && saved.accounts) return saved;
  } catch {}
  return { accounts: {} };
}
// A kept answer is read as the server's is: only in the shape expected.
function keptAnswer() {
  const kept = account ? keptAll().accounts[account] : null;
  if (!kept || !Array.isArray(kept.requests)) return null;
  const ai = kept.ai && typeof kept.ai === "object" && typeof kept.ai.client === "string" ? kept.ai : null;
  return { requests: kept.requests, ai };
}
function keepAnswer({ requests, ai }) {
  if (!account) return;
  try {
    const all = keptAll();
    all.accounts[account] = { requests: requests.slice(0, KEPT_REQUESTS), ai };
    localStorage.setItem(KEPT_KEY, JSON.stringify(all));
  } catch {}
}

/**
 * Follows the requests live: calls fn({ requests, ai }) at once from this device's copy of the last answer (when it
 * has one), then on every change from the server (requests newest first; ai: when an AI last checked in,
 * { client, at }, or null). A long poll while the page is visible, none while it's hidden. Returns stop().
 */
export function watchRequests(fn) {
  let version = "";
  // What fn was last given: an answer the same as it (the server's first, after this device's copy) isn't given again.
  let given = "";
  const give = (answer) => {
    const key = JSON.stringify(answer);
    if (key === given) return;
    given = key;
    fn(answer);
  };
  let stopped = false;
  let controller = null;
  let failures = 0;
  async function loop() {
    while (!stopped) {
      if (document.hidden) {
        await new Promise((resolve) => document.addEventListener("visibilitychange", resolve, { once: true }));
        continue;
      }
      controller = new AbortController();
      try {
        const response = await fetch(`/api/ai/requests?v=${encodeURIComponent(version)}&wait=${version ? 25 : 0}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (response.status === 401) return;
        if (!response.ok) throw new Error(`${response.status}`);
        const data = await response.json();
        failures = 0;
        if (data.version !== version) {
          version = data.version;
          const answer = { requests: Array.isArray(data.requests) ? data.requests : [], ai: data.ai ?? null };
          keepAnswer(answer);
          if (!stopped) give(answer);
        }
        // The server holds a few waits at once (one per open tab); past that it answers at once, and this waits.
        if (data.busy) await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        if (stopped || error.name === "AbortError") continue;
        failures++;
        await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 1000 * 2 ** Math.min(failures, 4))));
      }
    }
  }
  // Coming back into view: ask at once rather than finish a wait the phone may have frozen.
  const onVisible = () => !document.hidden && controller?.abort();
  document.addEventListener("visibilitychange", onVisible);
  const kept = keptAnswer();
  if (kept) give(kept);
  loop();
  return () => {
    stopped = true;
    controller?.abort();
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const MINUTE = 60_000;
function ago(ms, now) {
  const minutes = Math.round((now - ms) / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const day = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Where a request is, in words: { mark, text }. mark: waiting · working · done · failed · canceled (expired counts as
 * canceled). For example "Waiting for your AI · sent 5 min ago", "Claude is on it", "Done Oct 26", "Couldn't: why".
 */
export function requestStatus(request, now = Date.now()) {
  const who = request.client || "Your AI";
  if (request.state === "waiting") {
    const left = request.createdAt + REQUEST_TIMING.expire - now;
    const soon = left < 2 * 86_400_000 ? ` · goes in ${Math.max(1, Math.ceil(left / 86_400_000))} ${left < 86_400_000 * 1.5 ? "day" : "days"}` : "";
    return { mark: "waiting", text: `Waiting for your AI · sent ${ago(request.createdAt, now)}${soon}` };
  }
  if (request.state === "taken") return { mark: "working", text: `${who} is on it` };
  if (request.state === "done") return { mark: "done", text: `Done ${day(request.updatedAt)}${request.result?.said ? ` · ${request.result.said}` : ""}` };
  if (request.state === "couldnt") return { mark: "failed", text: `Couldn't: ${request.result?.why ?? "your AI didn't say why"}` };
  if (request.state === "canceled") return { mark: "canceled", text: `Canceled ${day(request.updatedAt)}` };
  return { mark: "canceled", text: `No AI took it in ${Math.round(REQUEST_TIMING.expire / 86_400_000)} days` };
}

/**
 * What a finished request links to: [{ kind: "pack" | "theme" | "practice" | "text", id, label }]. The screens make the
 * links (a pack's page, a theme's page, a past practice, a text in the reader). An answered question has its text in request.result.answer.
 */
export function requestLinks(request) {
  const links = request.result?.links ?? {};
  const out = [];
  if (links.pack) out.push({ kind: "pack", id: links.pack, label: `Open ${request.kind === "pack_add" && request.pack === links.pack ? request.packName : "the pack"}` });
  if (links.theme) out.push({ kind: "theme", id: links.theme, label: "See the theme" });
  if (links.practice) out.push({ kind: "practice", id: links.practice, label: "Open the practice" });
  if (links.text) out.push({ kind: "text", id: links.text, label: "Open the text" });
  return out;
}

/** The requests as they are now (without following them). */
export const listRequests = async () => (await api("/api/ai/requests")).requests;
