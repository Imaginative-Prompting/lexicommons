// What you're learning, asked: the one question. (Which language you speak was asked first until 11 Nov 2026; the app teaches from English
// alone, so it isn't asked: interface-language.js speaks.) A first run is the one thing the app has to ask before it can be any use to you: it comes up over Home on a device where no language has been picked and
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
import { speaks } from "./interface-language.js";
import { SITE_FACTS } from "../site-facts.js";
import { keepNote } from "./keep-here.js";

const CATALOGUE = "/library/catalogue.json";
const DONE = "lx.welcome.v1";
const LEARNING = "lx.learning.v1";
// Among the languages with a full course, the ones most people come for lead, then the rest by name (which languages have one is never
// written here: fullCourse below).
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
// Each language's lessons, as the catalog last said (its biggest pack's: a full course's path, or a starter's dozen); null until it has.
let lessonsNow = null;
/** A language's lessons: the catalog's count once it has answered, the release's own facts (site-facts.js) until then. */
const lessonsOf = (code) => (lessonsNow ? (lessonsNow.get(code) ?? 0) : (SITE_FACTS.lessons[code] ?? 0));
/** Whether a language has a full course: as many lessons as the site's facts call one (the same fact the home page counts them by). */
const fullCourse = (code) => lessonsOf(code) >= SITE_FACTS.fullCourse;
const askOffered = () =>
  (offeredAsk ??= fetch(CATALOGUE)
    .then((response) => (response.ok ? response.json() : null))
    .then((catalogue) => {
      const packs = catalogue?.packs;
      if (packs && typeof packs === "object") {
        offeredNow = new Set(Object.keys(packs).filter((code) => Array.isArray(packs[code]) && packs[code].some((pack) => !pack?.optIn)));
        lessonsNow = new Map(Object.keys(packs).map((code) => [code, Array.isArray(packs[code]) ? Math.max(0, ...packs[code].map((pack) => Number(pack?.lessons) || 0)) : 0]));
      }
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
 * The list's order: the languages with a full course first (the likeliest of them leading, FIRST, the rest by name), then every other
 * language by name; never the language you speak (interface-language.js speaks). { all, full }: every code in order, and how many lead.
 */
function choiceOrder() {
  const skip = speaks();
  const byName = (a, b) => languageLabel(a).localeCompare(languageLabel(b), intlLocale());
  const codes = Object.keys(LANGUAGES).filter((code) => code !== skip);
  const full = [...FIRST.filter((code) => codes.includes(code) && fullCourse(code)), ...codes.filter((code) => fullCourse(code) && !FIRST.includes(code)).sort(byName)];
  return { all: [...full, ...codes.filter((code) => !full.includes(code)).sort(byName)], full: full.length };
}

/**
 * A search and every language to learn, each a press: onPick(code). Returns { find, list }, to lay out as the caller likes. Two groups under
 * their headings: Full courses, each with its lessons, then First lessons (a starter). Only what has something to learn once the catalog says.
 */
function languageChoices(onPick) {
  const current = learning();
  const rowOf = new Map();
  const row = (code) => {
    if (!rowOf.has(code)) {
      const sub = el("span", { class: "lx-row-sub", hidden: true });
      const node = el(
        "li",
        { class: "lx-row-item" },
        el(
          "button",
          { part: "list-row", type: "button", "data-language": code, "aria-current": code === current ? "true" : undefined, onclick: () => onPick(code) },
          ui.languageFlag(code, { size: "lg", lazy: true }),
          el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, languageLabel(code)), sub),
        ),
      );
      rowOf.set(code, { node, sub });
    }
    return rowOf.get(code);
  };
  const head = (text, group) => el("li", { class: "lx-language-head", "data-group": group }, el("h2", { class: "lx-small lx-muted" }, text));
  const heads = { full: head(t("welcome.fullCourses"), "full"), rest: head(t("welcome.firstLessons"), "rest") };
  const list = el("ul", { part: "list" });
  // Laid out from what's known of each language's lessons: at once from the release's facts, again only if the catalog's answer changes the
  // groups or a count (a new course joins the first group).
  let all = [];
  let full = 0;
  let laid = "";
  const arrange = () => {
    const order = choiceOrder();
    const key = JSON.stringify([order.all, order.full, order.all.slice(0, order.full).map(lessonsOf)]);
    if (key === laid) return;
    laid = key;
    ({ all, full } = order);
    all.forEach((code, i) => {
      const { sub } = row(code);
      sub.hidden = i >= full;
      sub.textContent = i < full ? t("welcome.lessons", { count: lessonsOf(code) }) : "";
    });
    list.replaceChildren(heads.full, ...all.slice(0, full).map((code) => row(code).node), heads.rest, ...all.slice(full).map((code) => row(code).node));
  };
  arrange();
  // Only what has something to learn: the catalog says which, and until it answers they're all shown. (With no answer at all, nothing's taken away: picking one says what it needs.)
  let offered = null;
  const none = el("p", { class: "lx-small lx-muted", hidden: true }, t("welcome.noMatch"));
  const find = el("input", { part: "text-field", type: "search", placeholder: t("welcome.search"), "aria-label": t("welcome.search"), autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false" });
  const show = () => {
    const q = find.value.trim().toLocaleLowerCase(intlLocale());
    let shown = 0;
    const seen = { full: 0, rest: 0 };
    all.forEach((code, i) => {
      const hit = (!offered || offered.has(code)) && (!q || languageLabel(code).toLocaleLowerCase(intlLocale()).includes(q) || LANGUAGES[code].name.toLowerCase().includes(q));
      const { node } = row(code);
      node.hidden = !hit;
      // A row in the first screenful draws its flag at once (lx/ui.js languageFlag), whatever brought it there.
      const flag = hit && shown < ui.FLAG_ROWS_SHOWN ? node.querySelector('img[loading="lazy"]') : null;
      if (flag) Object.assign(flag, { loading: "eager", decoding: "sync" });
      if (hit) shown++;
      if (hit) seen[i < full ? "full" : "rest"]++;
    });
    // A heading only over rows that show, and none at all over a single group (a search's few hits need no sorting into two).
    heads.full.hidden = !seen.full || !seen.rest;
    heads.rest.hidden = !seen.rest || !seen.full;
    none.hidden = shown > 0;
  };
  find.addEventListener("input", show);
  // What the catalog last said, at once; a newer answer only if it differs.
  const take = (set) => {
    arrange();
    if (!set) return show();
    const next = new Set([...set, learning()]);
    if (offered && next.size === offered.size && [...next].every((code) => offered.has(code))) return show();
    offered = next;
    show();
  };
  take(offeredNow);
  askOffered().then(take);
  return { find, list: el("div", { class: "lx-language-list" }, list, none) };
}

/** Every language in a sheet (Settings → Language). */
export function openLanguageSheet() {
  const sheet = ui.sheetLayer({ label: t("welcome.addLanguage") });
  const { find, list } = languageChoices((code) => {
    sheet.lxClose();
    setLearning(code, fromFor(code, speaks()));
  });
  sheet.lxBody.append(el("div", { class: "lx-stack" }, el("h2", { class: "lx-sheet-title" }, t("welcome.addLanguage")), find, list));
  sheet.lxOpen();
}

/**
 * Opens the first run over the page. Returns it, or null if there's already one up. One question, one press: what you want to learn.
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
  const ask = (question, choices) => {
    node.setAttribute("aria-label", question);
    title.textContent = question;
    // Where this browser's progress is kept, said before lesson 1 where it's about to be lost (keep-here.js): an iPhone's browser, another
    // app's browser, the Home Screen app opening empty.
    const keep = keepNote({ fresh: true, where: "welcome" });
    head.replaceChildren(tinta, title, ...(keep ? [keep] : []), choices.find);
    body.replaceChildren(choices.list);
    node.scrollTop = 0;
  };
  ask(
    t("welcome.question"),
    languageChoices((code) => {
      close();
      setLearning(code, fromFor(code, speaks()));
      // (Picking the language it already was changes nothing, so nothing has asked for its packs yet.)
      syncLibraryPacks();
    }),
  );
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
