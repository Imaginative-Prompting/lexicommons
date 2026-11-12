// The sample learner's mark in the header (shell/main.js; /design shows it): while an admin looks at the app as a sample learner, "Sample"
// sits where the language you're learning does, in the same glass, with Off a tap away. An admin's tool, in English only, so it isn't in
// lx/ui.js, whose words go through t(). name: the preset's, its tooltip; onOff turns it off.
import { el } from "../lx/ui.js";

export function sampleMark(name, onOff) {
  const off = el("button", { type: "button", class: "lx-sample-off", "aria-label": `Turn the sample learner off (${name})`, onclick: onOff }, "Off");
  return el("div", { part: "sample-mark", title: `Sample learner: ${name}` }, el("span", { class: "lx-sample-name" }, "Sample"), off);
}
