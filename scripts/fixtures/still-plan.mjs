// A set plan a check plays in the real session: for mode "still", whatever globalThis.__stillPlan holds (set in the page before the session's
// address is opened). It wraps plan.js's own export, planSession, which every way into a session goes through, rather than a line where
// session.js calls it: v738's placement branch rewrote that line, and four checks quietly stopped playing their plans.
// Used by typing-games-check, speaking-words-check, component-check and result-layout-check.

/** plan.js's address, as the app asks for it (with or without its ?v=). */
export const PLAN_FILE = /\/js\/study\/plan\.js(\?|$)/;
const DEFINED = "export function planSession(";

/** plan.js's text with planSession playing globalThis.__stillPlan for mode "still", every other mode the app's own; null when its definition
 * isn't there to wrap (a check asserts it was wrapped, so a renamed export fails it rather than playing the app's plan). */
export function withStillPlan(text) {
  if (!text.includes(DEFINED)) return null;
  return `${text.replace(DEFINED, "function planSessionOwn(")}
export function planSession(mode, ...rest) {
  return mode === "still" && globalThis.__stillPlan ? globalThis.__stillPlan : planSessionOwn(mode, ...rest);
}
`;
}

/** Routes plan.js in a browser context (or a page) so mode "still" plays the set plan. { routed() }: how many times it was served wrapped. */
export async function routeStillPlan(target) {
  let routed = 0;
  await target.route(PLAN_FILE, async (route) => {
    const response = await route.fetch();
    const text = await response.text();
    const wrapped = withStillPlan(text);
    if (wrapped) routed++;
    return route.fulfill({ response, body: wrapped ?? text, headers: { ...response.headers(), "content-type": "text/javascript" } });
  });
  return { routed: () => routed };
}
