// The history has one owner, the router (main.js, "back: one rule"). A page that becomes another in the same entry (a form's Done turning into
// what it made, so a back skips the form) asks for it here; the router draws the new address in place and keeps its record. Never
// location.replace() (its entry comes in with no state, which the router would take for a new one) and never history.pushState.
/** Shows `href` in this entry of the history, in place of the page that's here. */
export function replaceRoute(href) {
  history.replaceState(history.state, "", href);
  dispatchEvent(new CustomEvent("lx-route-replaced"));
}
