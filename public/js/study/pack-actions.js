// What a pack's own page offers besides its settings: actions other parts of the app add (the community section's
// share, copy and follow), so the page never has to know about them. A module registers a function at load;
// the page asks each one for its actions for the pack in view.

const sources = [];

/**
 * Adds actions to every pack's page. fn(pack, info) returns [{ label, icon, run, opens? }] (run(): what a press does; it may
 * return a promise; opens: "sheet" when it opens a sheet over the page, so its row says so) or []. info: { kind: "yours" |
 * "default" | "follow" | "app", on, version? }.
 */
export function addPackAction(fn) {
  sources.push(fn);
}

/** The actions for a pack's page, from every registered source; one that throws offers nothing. */
export function packActions(pack, info) {
  return sources.flatMap((fn) => {
    try {
      const actions = fn(pack, info);
      return Array.isArray(actions) ? actions.filter((a) => a && typeof a.label === "string" && typeof a.run === "function") : [];
    } catch {
      return [];
    }
  });
}
