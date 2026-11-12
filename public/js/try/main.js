// Trying Lexicommons with no account (/try/): pick a language, then its first two lessons, in the real session screen. Nothing is kept as
// anyone's: the page's address alone puts every store that holds progress in the try-out's own (study/sample-mode.js demoPage), they're
// emptied as it starts, nothing goes out but error reports, and the packs it fetches are the ones carrying the lessons (packs.js). A quiet
// band says so, with the way to an account (or, on a browser that's signed in, to the app). After two lessons, a card says that's the
// try-out. A visitor who makes an account starts their course from lesson 1: nothing of the try-out is carried over.

import "../lx/error-report.js";
import { clearDemoStores, demoPage } from "../study/sample-mode.js";
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { keptMe } from "../shell/api.js";
import { languageChoices } from "../shell/welcome.js";
import { speaks } from "../shell/interface-language.js";
import { t } from "../lx/i18n.js";

const LESSONS = 2;
const ACCOUNT = "/login?new=1";
const signedIn = Boolean(keptMe());
const root = document.getElementById("root");
const app = el("div", { part: "app", class: "lx-try" });
root.replaceChildren(app);

// The band: what this is, and the one way on.
const band = el(
  "header",
  { class: "lx-try-band" },
  el("p", {}, el("strong", {}, "Trying Lexicommons."), " Nothing here is kept."),
  // Quiet: the way on is there, never pressed on anyone (the end card has the one strong button).
  signedIn ? ui.button("Go to your app", { size: "sm", onclick: () => location.assign("/app/") }) : ui.button("Make an account", { size: "sm", onclick: () => location.assign(ACCOUNT) }),
);
const stage = el("main", { class: "lx-try-stage" });
app.replaceChildren(band, stage);

let done = 0;
let session = null;

/**
 * The language to try: the first run's own chooser. It comes in whole, as the first run does: its first screenful's flags drawn first (1.2 s at
 * most), so they never pop in one by one.
 */
async function choose() {
  const tinta = ui.character({ size: 88, hidden: true });
  const { find, list } = languageChoices((code) => start(code));
  const flags = [...list.querySelectorAll('img[part="language-flag"], img[data-part="language-flag"]')].slice(0, 16);
  for (const flag of flags) flag.loading = "eager";
  await Promise.race([Promise.allSettled(flags.map((flag) => flag.decode())), new Promise((resolve) => setTimeout(resolve, 1200))]);
  stage.replaceChildren(el("div", { class: "lx-welcome-head" }, tinta, el("h1", { part: "page-title" }, t("welcome.question")), find), el("div", { class: "lx-welcome-list" }, list));
  requestAnimationFrame(() => tinta.isConnected && ui.playCharacter(tinta, "wave"));
}

async function start(code) {
  const [{ setLearning, fromFor }, { syncLibraryPacks }, { loadFrequency }] = await Promise.all([import("../study/learning.js"), import("../study/packs.js"), import("../study/frequency.js")]);
  setLearning(code, fromFor(code, speaks()));
  syncLibraryPacks();
  loadFrequency(code);
  lesson();
}

/** The next lesson on the language's path, in the session screen; its summary leads on to the next or to the end. */
async function lesson() {
  const { runSession } = await import("../study/session.js");
  const last = done + 1 >= LESSONS;
  // An action of the summary's is taken (it ends the session first); with none, the session was closed by its cross, partway.
  let acted = false;
  const act = (fn) => () => {
    acted = true;
    fn();
  };
  session = runSession(app, "lesson", undefined, {
    onExit: () => {
      session = null;
      // (The action, if there is one, runs straight after the session's own end.)
      setTimeout(() => !acted && end({ partway: true }), 0);
    },
    tryOut: {
      actions: last
        ? [{ label: "Done", variant: "white", onclick: act(() => ((done += 1), end())) }]
        : [
            signedIn ? { label: "Go to your app", onclick: act(() => location.assign("/app/")) } : { label: "Make an account", onclick: act(() => location.assign(ACCOUNT)) },
            { label: "Next lesson", variant: "white", onclick: act(() => ((done += 1), lesson())) },
          ],
    },
  });
}

/** That's the try-out: an account to keep going, plainly, and the way home. */
function end({ partway = false } = {}) {
  const tinta = ui.character({ size: 88, hidden: true });
  const tried = done >= LESSONS;
  stage.replaceChildren(
    el(
      "section",
      { class: "lx-try-end" },
      tinta,
      el("h1", { part: "page-title" }, tried ? "That's the try-out" : "Trying Lexicommons"),
      el(
        "p",
        {},
        signedIn
          ? "Your own course and progress are in your app. Nothing you did here was added to them."
          : tried
            ? "To keep going, make an account. It's free. Your course starts from lesson 1, and from then on everything you do is kept."
            : "Nothing you did here is kept. With an account, your course starts from lesson 1 and everything you do is kept.",
      ),
      el(
        "div",
        { class: "lx-try-actions" },
        signedIn ? ui.button("Go to your app", { variant: "go", size: "lg", onclick: () => location.assign("/app/") }) : ui.button("Make an account", { variant: "go", size: "lg", onclick: () => location.assign(ACCOUNT) }),
        ui.button("Back to the home page", { size: "lg", onclick: () => location.assign("/") }),
      ),
      partway && !tried ? el("p", { class: "lx-small" }, el("a", { href: "#", onclick: (event) => (event.preventDefault(), lesson()) }, "Back to the lesson")) : null,
    ),
  );
  requestAnimationFrame(() => tinta.isConnected && ui.playCharacter(tinta, tried ? "heart" : "wave"));
}

if (demoPage()) {
  // What a try-out before this one left (this browser's), gone first: every try-out starts with nothing.
  await clearDemoStores();
  const [{ loadProgress }, { loadPacks }, { loadClips }, { loadWordIndex }, { loadPlanKept }] = await Promise.all([
    import("../study/progress.js"),
    import("../study/packs.js"),
    import("../study/clips.js"),
    import("../know/word-index.js"),
    import("../study/plan-kept.js"),
  ]);
  await Promise.all([loadProgress(), loadPacks(), loadClips(), loadWordIndex(), loadPlanKept()]);
  await choose();
  document.documentElement.setAttribute("data-app-ready", "");
}
