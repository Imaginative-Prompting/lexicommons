// The in-app AI on the plan (src/ai-hosted.ts): the device asks Lexicommons, which asks the model on its own key and passes the
// answer back as it comes. The request is built on the server from what the practice room holds: the device sends only which
// practice and the last turn it has seen. Translate with AI (translateWithAi) is here for Translate's page.

import { api, post } from "../shell/api.js";

export const HOSTED_NAME = "Lexicommons AI";

/** Whether this account can use it now, by /api/me: the site offers it, and the plan is active with AI in it. */
export const hostedReady = (me) => Boolean(me?.features?.hostedAi && me?.plan?.active && Number(me.plan.ai?.allowance) > 0);

/**
 * A practice's next reply, or its summary once it has ended, as the provider's stream: resolves to the Response, whose body the
 * caller reads (ai/inapp.js readChat). Refused, it throws as any call does, in words, with error.code: "stale" (a turn came since
 * `after`; error.data.after is the newest), "busy" (the last answer is still coming), "used_up" (this month's AI is spent;
 * error.data.resets, when it comes back), "no_plan", "ended".
 */
export const hostedStream = (kind, body, { signal } = {}) =>
  api(`/api/ai/hosted/${kind === "summary" ? "summary" : "reply"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal, stream: true });

/** Translate with AI: { from, to, text, learning } → { translation, literal, note, alternatives }, checked on the server. */
export const translateWithAi = ({ from, to, text, learning }) => post("/api/ai/hosted/translate", { from, to, text, learning });
