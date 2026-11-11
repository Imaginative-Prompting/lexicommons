// What you're learning, asked. A first run is the one thing the app has to ask before it can be any use to you: it comes up over Home on a device where no language has been picked and
// nothing's been studied (so an account you already use, on a new phone, is asked too: the language you're learning is kept per device), and it's gone at the first press. Nothing here
// waits on a download: a language's packs start coming as soon as it's picked (study/packs.js follows the language). Settings → Language opens the same list, in a sheet.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { LANGUAGES } from "../lang/index.js";
import { intlLocale, languageLabel, t } from "../lx/i18n.js";
import { allEvidence } from "../study/progress.js";
import { fromFor, learning, setLearning } from "../study/learning.js";
import { syncLibraryPacks } from "../study/packs.js";
import { streakExport } from "../study/done.js";
import { deviceLanguages, iSpeak, saidISpeak, setISpeak } from "./interface-language.js";

const CATALOGUE = "/library/catalogue.json";
const DONE = "lx.welcome.v1";
const LEARNING = "lx.learning.v1";
// The languages most people come for, then the rest by name. Dutch first: it has the most.
const FIRST = ["nl", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"];

const saved = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return "unknown";
  }
};
const finishedAnything = () => {
  try {
    return Object.keys(streakExport().things).length > 0;
  } catch {
    return false;
  }
};

/** Whether this device should be asked what it's learning. */
export const needsWelcome = () => !saved(DONE) && !saved(LEARNING) && !allEvidence().length && !finishedAnything();
/** Whether this device may be asked, from what it keeps alone (no evidence read yet): a start holds the app's frame until it knows
 * (shell/main.js), so a first run never comes in over an empty Home. */
export const mayNeedWelcome = () => !saved(DONE) && !saved(LEARNING);
// The first run's first screenful of flags, drawn before it shows (a start's own: openWelcome({ whole })), at most this long.
const FLAGS_FIRST = 16;
const FLAGS_WAIT = 1200;

const remember = () => {
  try {
    localStorage.setItem(DONE, String(Date.now()));
  } catch {}
};

// The languages with something to learn, as the catalog last said (a set of codes), and the ask on its way. Asked for when a page with the
// list is drawn (primeLanguageChoices), so a sheet of them opens already showing only those: one filtered after it came up shrank from the
// whole list to a few rows mid-slide (5 Nov 2026, Settings → Language).
let offeredNow = null;
let offeredAsk = null;
const askOffered = () =>
  (offeredAsk ??= fetch(CATALOGUE)
    .then((response) => (response.ok ? response.json() : null))
    .then((catalogue) => {
      const packs = catalogue?.packs;
      if (packs && typeof packs === "object") offeredNow = new Set(Object.keys(packs).filter((code) => Array.isArray(packs[code]) && packs[code].some((pack) => !pack?.optIn)));
      return offeredNow;
    })
    .catch(() => offeredNow)
    .finally(() => (offeredAsk = null)));
/** Asks the catalog which languages have something to learn, ahead of a list of them being shown (Settings → Language), and keeps
 * the flags of the rows it will show first (lx/ui.js warmFlags), so its sheet draws them at once the first time too. */
export const primeLanguageChoices = () => {
  const warm = () => ui.warmFlags(choiceOrder().all.filter((code) => !offeredNow || offeredNow.has(code) || code === learning()).slice(0, ui.FLAG_ROWS_SHOWN));
  warm();
  askOffered().then(warm);
};

/**
 * A search and every language, each a press: onPick(code). Returns { find, list }, to lay out as the caller likes. speak: the list for the
 * language you speak (every language, this phone's own first, none taken away), instead of the one to learn (the language you speak left
 * out, and only what has something to learn once the catalog says).
 */
/** The list's order: the language you speak's list leads with this phone's own, the one to learn with the likeliest (FIRST), the rest by name. */
function choiceOrder({ speak = false } = {}) {
  const device = speak ? deviceLanguages() : [];
  const lead = speak ? device : FIRST;
  const skip = speak ? null : (iSpeak() ?? "en");
  return { device, all: [...lead.filter((code) => LANGUAGES[code] && code !== skip), ...Object.keys(LANGUAGES).filter((code) => code !== skip && !lead.includes(code)).sort((a, b) => languageLabel(a).localeCompare(languageLabel(b), intlLocale()))] };
}

function languageChoices(onPick, { speak = false } = {}) {
  const { device, all } = choiceOrder({ speak });
  const current = speak ? (saidISpeak() ? iSpeak() : null) : learning();
  const subOf = (code) => (speak ? (device.includes(code) ? t("welcome.thisPhone") : null) : code === "nl" ? t("welcome.mostSoFar") : null);
  const rows = all.map((code, i) =>
    el(
      "li",
      { class: "lx-row-item" },
      el(
        "button",
        { part: "list-row", type: "button", "data-language": code, "aria-current": code === current ? "true" : undefined, onclick: () => onPick(code) },
        ui.languageFlag(code, { size: "lg", lazy: i >= ui.FLAG_ROWS_SHOWN }),
        el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, languageLabel(code)), subOf(code) ? el("span", { class: "lx-row-sub" }, subOf(code)) : null),
      ),
    ),
  );
  // Only what has something to learn: the catalog says which, and until it answers they're all shown. (With no answer at all, nothing's taken away: picking one says what it needs.)
  let offered = null;
  const none = el("p", { class: "lx-small lx-muted", hidden: true }, t("welcome.noMatch"));
  const find = el("input", { part: "text-field", type: "search", placeholder: t("welcome.search"), "aria-label": t("welcome.search"), autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false" });
  const show = () => {
    const q = find.value.trim().toLocaleLowerCase(intlLocale());
    let shown = 0;
    all.forEach((code, i) => {
      const hit = (!offered || offered.has(code)) && (!q || languageLabel(code).toLocaleLowerCase(intlLocale()).includes(q) || LANGUAGES[code].name.toLowerCase().includes(q));
      rows[i].hidden = !hit;
      // A row the search or the catalog brings into the first screenful draws its flag at once (lx/ui.js languageFlag).
      const flag = hit && shown < ui.FLAG_ROWS_SHOWN ? rows[i].querySelector('img[loading="lazy"]') : null;
      if (flag) Object.assign(flag, { loading: "eager", decoding: "sync" });
      if (hit) shown++;
    });
    none.hidden = shown > 0;
  };
  find.addEventListener("input", show);
  // What the catalog last said, at once; a newer answer only if it differs.
  const take = (set) => {
    if (!set) return;
    const next = new Set([...set, learning()]);
    if (offered && next.size === offered.size && [...next].every((code) => offered.has(code))) return;
    offered = next;
    show();
  };
  if (!speak) {
    take(offeredNow);
    askOffered().then(take);
  }
  return { find, list: el("div", { class: "lx-language-list" }, el("ul", { part: "list" }, rows), none) };
}

/** Every language in a sheet (Settings → Language). */
export function openLanguageSheet() {
  const sheet = ui.sheetLayer({ label: t("welcome.addLanguage") });
  const { find, list } = languageChoices((code) => {
    sheet.lxClose();
    setLearning(code, fromFor(code, iSpeak()));
  });
  sheet.lxBody.append(el("div", { class: "lx-stack" }, el("h2", { class: "lx-sheet-title" }, t("welcome.addLanguage")), find, list));
  sheet.lxOpen();
}

/** Every language, to pick the one you speak, in a sheet (Settings → Language). */
export function openSpeakSheet() {
  const sheet = ui.sheetLayer({ label: t("welcome.speakQuestion") });
  const { find, list } = languageChoices(
    (code) => {
      sheet.lxClose();
      setISpeak(code);
    },
    { speak: true },
  );
  sheet.lxBody.append(el("div", { class: "lx-stack" }, el("h2", { class: "lx-sheet-title" }, t("welcome.speakQuestion")), find, list));
  sheet.lxOpen();
}

/**
 * Opens the first run over the page. Returns it, or null if there's already one up. Two questions, each one press: the language you speak
 * (this phone's languages first, none assumed), then the one you want to learn. A device that has said which it speaks is asked only the
 * second.
 */
/**
 * The first run, over the app. whole (a start's): it shows once its first screenful's flags are drawn (FLAGS_WAIT at most), so it comes in
 * whole rather than with its flags popping in; it then returns a promise of its node. Else it shows at once and returns its node.
 */
export function openWelcome({ whole = false } = {}) {
  if (document.querySelector(".lx-welcome")) return null;
  const previously = document.activeElement;
  const tinta = ui.character({ size: 88, hidden: true });
  const title = el("h1", { part: "page-title" });
  const head = el("div", { class: "lx-welcome-head" }, tinta);
  const body = el("div", { class: "lx-welcome-list" });
  const node = el("div", { class: "lx-welcome", role: "dialog", "aria-modal": "true" }, head, body);
  const close = () => {
    remember();
    node.remove();
    document.documentElement.removeAttribute("data-scroll-lock");
    previously?.focus?.({ preventScroll: true });
  };
  const ask = (question, choices, extra = null) => {
    node.setAttribute("aria-label", question);
    title.textContent = question;
    head.replaceChildren(tinta, title, ...[extra, choices.find].filter(Boolean));
    body.replaceChildren(choices.list);
    node.scrollTop = 0;
  };
  const askLearning = () => {
    const speak = iSpeak();
    // What you said you speak, with the way back to it.
    const said = speak
      ? el("p", { class: "lx-welcome-said lx-small lx-muted" }, t("welcome.youSpeak", { language: languageLabel(speak) }), " ", el("button", { type: "button", class: "lx-welcome-change", onclick: askSpeak }, t("welcome.change")))
      : null;
    ask(
      t("welcome.question"),
      languageChoices((code) => {
        close();
        setLearning(code, fromFor(code, iSpeak()));
        // (Picking the language it already was changes nothing, so nothing has asked for its packs yet.)
        syncLibraryPacks();
      }),
      said,
    );
  };
  function askSpeak() {
    ask(
      t("welcome.speakQuestion"),
      languageChoices(
        (code) => {
          setISpeak(code);
          askLearning();
        },
        { speak: true },
      ),
    );
  }
  if (saidISpeak()) askLearning();
  else askSpeak();
  const show = () => {
    document.body.append(node);
    document.documentElement.setAttribute("data-scroll-lock", "");
    requestAnimationFrame(() => tinta.isConnected && ui.playCharacter(tinta, "wave"));
    return node;
  };
  if (!whole) return show();
  const flags = [...body.querySelectorAll('img[part="language-flag"], img[data-part="language-flag"]')].slice(0, FLAGS_FIRST);
  for (const flag of flags) flag.loading = "eager";
  return Promise.race([Promise.allSettled(flags.map((flag) => flag.decode())), new Promise((resolve) => setTimeout(resolve, FLAGS_WAIT))]).then(show);
}
