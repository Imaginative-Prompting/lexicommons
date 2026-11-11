// Whether this person may publish to Explore: share a pack or a book, ask on the request board (and answer, reopen, say Me too), suggest a
// fix to a pack or flag it, suggest to a grammar. /api/me's mayShare (src: COMMUNITY_SHARING is "everyone", or the account is an admin),
// the last answer kept on this device (shell/api.js keptMe), so a page is right in its first frame. With sharing off (for launch), every way
// to publish is left out of the screens, never shown and then refused: no dead buttons, no "coming soon". What stays for everyone: reading
// Explore, adding and following, likes, reports and counter-notices, withdrawing your own and closing your own request.
// An answer from a server before the field is taken as open (it refuses on its own); signed out, closed.
//
// The learner view (Settings → Admin → See the app as a learner): on an admin's device, on until they turn it off, the app shows what a
// learner sees: every admin-only way in left out (sharing while it's closed to learners, an AI token's admin access). It's this device's
// setting, and the server still lets an admin act either way. /api/me's features.sharing says what a learner gets ("admins": sharing closed
// to them, "everyone": open); from a server before that field, an admin's view can't tell, and takes it as closed.

import { keptMe } from "./api.js";

const VIEW_KEY = "lx.learnerView.v1";
const listeners = new Set();

/** Whether the account is an admin, by the last /api/me kept here. */
export const isAdmin = () => Boolean(keptMe()?.roles?.includes("admin"));

/** An admin's device showing the app as a learner sees it: on unless they turned it off here. Never for anyone else. */
export function learnerView() {
  if (!isAdmin()) return false;
  try {
    return localStorage.getItem(VIEW_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Turns the learner view on or off on this device, and tells the pages that draw from it. */
export function setLearnerView(on) {
  try {
    localStorage.setItem(VIEW_KEY, on ? "on" : "off");
  } catch {
    // Private browsing: this visit only (the default, on, comes back next time).
  }
  sharingChanged();
}

/** Something sharing is drawn from changed (the learner view, a preview of sharing on this device): the pages that draw from it hear it. */
export function sharingChanged() {
  for (const fn of listeners) fn();
}

/** What draws from the learner view (Explore's home, Settings → Admin) hears when it changes. Returns what stops it. */
export function onSharingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Whether sharing is open to learners on this site (features.sharing), so Explore's face offers Share and Ask for it. */
export function sharingOpen() {
  const me = keptMe();
  if (!me) return false;
  const said = me.features?.sharing;
  if (said === "everyone" || said === "admins") return said === "everyone";
  // A server from before features.sharing: a learner's own answer says it; an admin's can't.
  return !me.roles?.includes("admin") && me.mayShare !== false;
}

export function mayShare() {
  const me = keptMe();
  if (!me) return false;
  if (learnerView()) return sharingOpen();
  return me.mayShare !== false;
}

/** An admin seeing the app as an admin (the learner view off): the admin-only ways in are drawn. */
export const adminView = () => isAdmin() && !learnerView();
