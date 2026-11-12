// Requests in Explore (the board; src/board.ts is the server): what people ask for, a pack in a language or a book
// woven into one, and asking yourself, with or without an AI. Someone who has one answers a pack request with a pack
// they share; a request for a book on the shelf is answered by its layer going on it. explore.js routes here:
//   #explore/requests?lang&kind&sort&state   the board (the language you're learning first)
//   #explore/request/<id>                     one request: what it asks, "me too", its answers, and its author's
//                                             done, close and open again
// and draws two pieces of it: the row on Explore's home (requestsRow) and Yours' requests (yourRequests).
// Every server value goes into the page as text (el), never as markup.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { api, del, post } from "../shell/api.js";
import { reasonPicker, termsFirst } from "./terms.js";
import { LANGUAGES, languageName, ourLanguages } from "../lang/index.js";
import { learning } from "../study/learning.js";
import { t } from "../lx/i18n.js";
import { symbol } from "../lx/symbols.js";
import { aiConnected } from "../shell/layout.js";
import { heldHeight, keepHeight } from "../lx/shapes.js";
import { mayShare } from "../shell/sharing.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LIMITS = { title: 120, details: 1000, bookTitle: 200, bookAuthor: 200, bookSource: 300 };
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const ago = (iso) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString();
};
const requestHref = (id) => `#explore/request/${encodeURIComponent(id)}`;
const itemHref = (id) => `#explore/item/${encodeURIComponent(id)}`;
const learnable = (code) => typeof code === "string" && code !== "en" && Object.hasOwn(LANGUAGES, code);
// The languages to ask in: the one you're learning first, then every other the app has, by name (as Explore's).
const languagesOf = () => [learning(), ...ourLanguages().filter((code) => code !== "en" && code !== learning()).sort((a, b) => languageName(a).localeCompare(languageName(b)))];

/** A status line (as Explore's): what came of a press, in words. */
const message = () => {
  const node = el("p", { class: "lx-settings-message", role: "status" });
  node.say = (text, tone) => {
    node.replaceChildren(text ?? "");
    if (tone) node.setAttribute("data-tone", tone);
    else node.removeAttribute("data-tone");
  };
  // Something that didn't go: the words with Retry (the same again), Tinta beside them (ui.retryLine).
  node.fail = (text, retry, options) => {
    node.replaceChildren(ui.retryLine(text, retry, options));
    node.setAttribute("data-tone", "wrong");
  };
  return node;
};
/** A sheet over the page (ui.sheetLayer, as Explore's openSheet). */
function openSheet(label, rows, { content } = {}) {
  const layer = ui.sheetLayer({ label });
  layer.lxBody.replaceChildren(el("h2", { class: "lx-sheet-title" }, label), content ?? el("ul", { part: "list" }, rows));
  layer.lxOpen();
  return { close: (options) => layer.lxClose(options) };
}
/** What went wrong with a request to the server, in words (one that can't reach it too). */
// api.js's words already say offline from unreachable, and never a code.
const wordsFor = (error) => error?.message || "Something went wrong. Try again in a moment.";
/** A button that sends something, one press at a time: off while it's out, on again unless fn resolves to true. */
function sendOnce(button, fn) {
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      if ((await fn()) !== true) button.disabled = false;
    } catch (error) {
      button.disabled = false;
      throw error;
    }
  });
}

/**
 * What a request is, in a short line: its answers first (what someone looking wants to know), how many want it too, then
 * its book, level and topic. Its kind is the row's symbol, and who asked and when are on its page (requestPage).
 */
function requestSub(r) {
  return [
    r.answers ? `${plural(r.answers, "answer")}${r.newAnswers ? `, ${r.newAnswers} new` : ""}` : null,
    r.likes ? `${r.likes} more ${r.likes === 1 ? "wants" : "want"} it` : null,
    r.kind === "book" && r.book?.title ? r.book.title : null,
    r.level ? `Level ${r.level}` : null,
    r.topic?.name ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}
/** Where a request is, for its author (anyone else sees only open and done ones). */
const STATE_WORDS = { pending: "Waiting for an admin", done: "Done", closed: "Closed", declined: "Declined" };
const requestRow = (r) =>
  ui.listRow({
    icon: r.kind === "book" ? "book" : "cards",
    title: r.title,
    sub: [r.shown ? (r.shownReason ?? "Hidden after a report") : null, STATE_WORDS[r.state] ?? null, requestSub(r)].filter(Boolean).join(" · "),
    href: requestHref(r.id),
  });

// ---------- the row on Explore's home, and Yours' requests ----------

/** Explore home's way in: static, so the home draws whole from the device (explore.js renderHome). */
export const requestsRow = (lang) => ui.group(null, [ui.listRow({ icon: "chat", title: "Ask for it", href: `#explore/requests?lang=${encodeURIComponent(lang)}` })]);

/** Yours' requests: each of yours, newest first, whatever became of it, with new answers said. Resolves to a section, or null with none. */
export async function yourRequests() {
  const mine = await api("/api/community/requests?mine=1");
  return mine.length ? ui.group("Your requests", mine.map(requestRow), "New answers show here until you open the request.") : null;
}

// ---------- the board ----------

/** Every language to ask in, in a sheet: pick one (onpick), or go to its board. */
function languageSheet(label, current, onpick) {
  const sheet = openSheet(
    label,
    languagesOf().map((code, i) =>
      ui.listRow({
        title: [ui.languageFlag(code, { lazy: i >= ui.FLAG_ROWS_SHOWN }), languageName(code)],
        sub: [code === learning() ? "Learning" : null, code === current ? "Chosen" : null].filter(Boolean).join(" · ") || undefined,
        onclick: () => {
          sheet.close({ animate: false });
          onpick(code);
        },
      }),
    ),
  );
}

export function renderRequests(page, params = {}) {
  const lang = learnable(params.lang) ? params.lang : learning();
  const kind = params.kind === "pack" || params.kind === "book" ? params.kind : "";
  const done = params.state === "done";
  const sort = params.sort === "new" ? "new" : "popular";
  const name = languageName(lang);
  const go = (next) => {
    const q = { lang, kind, sort, state: done ? "done" : "", ...next };
    location.hash = `#explore/requests?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`;
  };
  const msg = message();
  const list = el("ul", { part: "list" });
  const status = el("p", { class: "lx-small lx-muted" });
  // The list comes from the server: its place is held as tall as it was last time (lx/shapes.js), and it arrives into it (ui.arrive).
  const board = el("div", { class: "lx-stack" }, list, status);
  const holder = ui.held({ height: heldHeight("explore.requests") ?? 180 }, "requests");
  const languageButton = ui.button([ui.languageFlag(lang), name], { size: "sm", onclick: () => languageSheet("Requests in", lang, (code) => go({ lang: code })) });
  languageButton.setAttribute("aria-label", `Language: ${name}`);
  // Its sheet draws its first rows' flags at once, the first time too (lx/ui.js warmFlags).
  ui.warmFlags(languagesOf().slice(0, ui.FLAG_ROWS_SHOWN));
  const quiet = (art, options) => ui.listRow({ ...options, art: symbol(art, { size: 24 }) });
  // The shelf as it is now, each time the board opens (books go on it); the topics once a visit to the app is enough.
  loadTopics();
  shelfKnown = null;
  shelfComing = null;
  loadShelf().catch(() => {});
  // What the page is for, then the two asks: a learner asking for what isn't here, and people who make packs answering it.
  const asks = el(
    "ul",
    { part: "list", class: "lx-requests-asks" },
    quiet("cards-q", { title: t("explore.requests.askPack"), sub: t("explore.requests.askPackSub"), opens: "sheet", onclick: () => packSheet(lang, { msg }) }),
    quiet("reading-q", { title: t("explore.requests.askBook"), sub: t("explore.requests.askBookSub", { language: name }), opens: "sheet", onclick: () => bookSheet(lang, { msg }) }),
  );
  // With an AI connected (only then), the other way: it makes the pack now, in the AI tab.
  const yourAi = aiConnected() ? [el("ul", { part: "list" }, quiet("ai-q", { title: t("explore.requests.askAi"), sub: t("explore.requests.askAiSub"), href: "#ai" }))] : [];
  // Which requests, in one row of small buttons, each opening its choices in a sheet: the list is what the page is for.
  const choice = (label, options, value, onpick) => {
    const shown = options.find(([v]) => v === value)?.[1] ?? options[0][1];
    // No icon: the three fit one line at 320 wide this way, and each says what it's set to.
    const button = ui.button(shown, {
      size: "sm",
      onclick: () => {
        const sheet = openSheet(
          label,
          options.map(([v, text]) =>
            ui.radioRow({
              title: text,
              name: `requests-${label}`,
              value: v,
              checked: v === value,
              onchange: () => {
                sheet.close({ animate: false });
                onpick(v);
              },
            }),
          ),
        );
      },
    });
    button.setAttribute("aria-label", `${label}: ${shown}`);
    return button;
  };
  page.replaceChildren(
    ui.pageTitle(t("explore.requests.title"), mayShare() ? t("explore.requests.lead", { language: name }) : undefined),
    ...(mayShare() ? [asks, ...yourAi] : []),
    msg,
    el("p", { class: "lx-choice-title" }, t("explore.requests.wanted", { language: name })),
    el(
      "div",
      { class: "lx-inline-form lx-requests-filters" },
      languageButton,
      choice("Kind", [["", "All kinds"], ["pack", "Packs"], ["book", "Books"]], kind, (value) => go({ kind: value })),
      choice("Order", [["popular", "Most wanted"], ["new", "Newest"], ["done", "Answered"]], done ? "done" : sort, (value) => go(value === "done" ? { state: "done", sort: "" } : { sort: value, state: "" })),
    ),
    holder,
  );
  const settle = () => {
    if (holder.isConnected) ui.arrive(holder, board);
    requestAnimationFrame(() => keepHeight("explore.requests", board));
  };
  let stale = false;
  const load = async () => {
    try {
      const rows = await api(`/api/community/requests?${new URLSearchParams(Object.entries({ lang, kind, sort, state: done ? "done" : "" }).filter(([, v]) => v))}`);
      if (stale) return;
      list.replaceChildren(...rows.map(requestRow));
      // Sent here from the end of the lessons: join whoever's already asked, or ask, with the words written for you.
      if (params.ask === "lessons" && mayShare()) {
        history.replaceState(history.state, "", `#explore/requests?lang=${encodeURIComponent(lang)}`);
        const wanted = `More lessons in ${name}`;
        const asked = rows.find((r) => r.kind === "pack" && r.title === wanted);
        if (asked) location.hash = requestHref(asked.id);
        else packSheet(lang, { msg, wanted });
      } else if (params.ask === "pack" && mayShare()) {
        history.replaceState(history.state, "", `#explore/requests?lang=${encodeURIComponent(lang)}`);
        packSheet(lang, { msg, wanted: String(params.about ?? "").slice(0, LIMITS.title) });
      }
      status.replaceChildren(rows.length ? "" : ui.emptyState(done ? `Nothing answered in ${name} yet.` : `Nobody has asked for anything in ${name} yet.`, { pose: "page", art: "empty-requests" }));
      settle();
    } catch (error) {
      if (stale) return;
      status.replaceChildren(ui.loadFailed(error, load, { offline: "Requests need a connection. They'll come back by themselves once you're online." }));
      settle();
    }
  };
  load();
  return { title: "Explore", back: { href: `#explore?lang=${lang}`, label: "Explore" }, dispose: () => (stale = true) };
}

// ---------- asking ----------

// What the ask sheets list, fetched as the board opens so a sheet opened after draws them in its first frame (nothing pops in under its
// question): the server's topics, and the shelf's books.
let topicsKnown = null;
let topicsComing = null;
const loadTopics = () => (topicsComing ??= api("/api/community/topics").then((topics) => (topicsKnown = Array.isArray(topics) ? topics : []), () => ((topicsComing = null), null)));
let shelfKnown = null;
let shelfComing = null;
const loadShelf = () => (shelfComing ??= shelfBooks().then((books) => (shelfKnown = books), (error) => ((shelfComing = null), Promise.reject(error))));

/** The shelf's books, from the open library's catalog: id, title, the languages it's woven with. */
async function shelfBooks() {
  const response = await fetch("/library/catalogue.json", { credentials: "same-origin" });
  const catalogue = response.ok ? await response.json().catch(() => null) : null;
  return (Array.isArray(catalogue?.books) ? catalogue.books : [])
    .filter((b) => typeof b?.id === "string")
    .map((b) => ({ id: b.id, title: typeof b.title === "string" ? b.title : b.id, author: Array.isArray(b.authors) ? b.authors.filter((a) => typeof a === "string").join(", ") || null : typeof b.author === "string" ? b.author : null, lang: typeof b.lang === "string" ? b.lang : "en", layers: Object.keys(b.layers ?? {}) }));
}

/**
 * Asking (G9, 6 Nov): two short sheets, each one question first. A pack: what it should be about, a topic and a level if you like. A book:
 * choose it, the shelf's books not in the language yet listed in place, or name one that isn't on the shelf. The board's language is the
 * one asked in. msg: the board's status line; wanted: words to start with (the end of the lessons, an empty search).
 */
function askFoot(button, status) {
  return ui.pinnedActions([button], { status, note: t("explore.requests.shared") });
}
async function asked(sheet, { msg, form, send, status }, body) {
  // The sharing terms come first (a request's words are shared too): asked once, here, and what they wrote goes on.
  if (!(await termsFirst(form, { from: send }))) return false;
  let posted;
  try {
    posted = await post("/api/community/requests", body);
  } catch (error) {
    status.replaceChildren(wordsFor(error));
    return false;
  }
  sheet.close({ animate: false });
  msg?.say(posted.state === "pending" ? t("explore.requests.askedPending") : t("explore.requests.asked"), "right");
  location.hash = requestHref(posted.id);
  return true;
}

function packSheet(lang, { msg, wanted = "" } = {}) {
  const state = { topic: null, level: null };
  const about = el("input", { part: "text-field", maxlength: LIMITS.title, placeholder: t("explore.requests.aboutHint"), "aria-label": t("explore.requests.about"), value: wanted });
  const details = el("textarea", { part: "text-field", rows: 2, maxlength: LIMITS.details, placeholder: t("explore.requests.more"), "aria-label": t("explore.requests.more") });
  const chips = el("div", { class: "lx-chips", role: "group", "aria-label": t("explore.requests.topic") });
  const topicPart = el("section", { class: "lx-group", "aria-label": t("explore.requests.topic"), hidden: !topicsKnown?.length }, el("p", { class: "lx-choice-title" }, t("explore.requests.topic")), chips);
  const level = ui.choiceRow({ title: t("explore.requests.level"), options: [["", t("explore.requests.anyLevel")], ...LEVELS.map((l) => [l, l])], value: "", onchange: (v) => (state.level = v || null) });
  const send = ui.button(t("explore.requests.askIt"), { variant: "go", size: "lg", block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const form = el(
    "div",
    { class: "lx-stack" },
    el("label", { class: "lx-stack lx-ask-field" }, el("span", { class: "lx-choice-title" }, t("explore.requests.about")), about),
    topicPart,
    el("ul", { part: "list" }, level),
    details,
    askFoot(send, status),
  );
  const sheet = openSheet(t("explore.requests.askPack"), null, { content: form });
  // A topic, if one fits: the server's topics as chips, one at a time, pressed again to let it go. Drawn with the sheet when the board has
  // them; when it hasn't (offline, still coming), the sheet has none: a pack asked for with no topic is fine, and nothing pops in.
  const drawChips = () =>
    chips.replaceChildren(
      ...(topicsKnown ?? []).map((topic) =>
        el("button", { type: "button", class: "lx-chip", "aria-pressed": String(state.topic === topic.id), onclick: () => ((state.topic = state.topic === topic.id ? null : topic.id), drawChips()) }, topic.name),
      ),
    );
  drawChips();
  sendOnce(send, async () => {
    const words = about.value.trim();
    if (words.length < 3) return status.replaceChildren(t("explore.requests.sayAbout"));
    return asked(sheet, { msg, form, send, status }, {
      kind: "pack",
      language: lang,
      title: words,
      ...(details.value.trim() ? { details: details.value.trim() } : {}),
      ...(state.level ? { level: state.level } : {}),
      ...(state.topic ? { topic: state.topic } : {}),
    });
  });
}

function bookSheet(lang, { msg } = {}) {
  const name = languageName(lang);
  let chosen = null; // a shelf book's id, or "named"
  const bookTitle = el("input", { part: "text-field", maxlength: LIMITS.bookTitle, placeholder: t("explore.requests.bookTitle"), "aria-label": t("explore.requests.bookTitle") });
  const bookAuthor = el("input", { part: "text-field", maxlength: LIMITS.bookAuthor, placeholder: t("explore.requests.bookAuthor"), "aria-label": t("explore.requests.bookAuthor") });
  const bookSource = el("input", { part: "text-field", maxlength: LIMITS.bookSource, placeholder: t("explore.requests.bookSource"), "aria-label": t("explore.requests.bookSource") });
  const named = el("div", { class: "lx-stack", hidden: true }, bookTitle, bookAuthor, bookSource, el("p", { class: "lx-small lx-muted" }, t("explore.requests.namedNote")));
  const details = el("textarea", { part: "text-field", rows: 2, maxlength: LIMITS.details, placeholder: t("explore.requests.more"), "aria-label": t("explore.requests.more") });
  const lead = el("p", { class: "lx-small lx-muted" }, t("explore.requests.bookLead", { language: name }));
  const choices = el("div", { class: "lx-stack" });
  const send = ui.button(t("explore.requests.askIt"), { variant: "go", size: "lg", block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const form = el("div", { class: "lx-stack" }, lead, choices, named, details, askFoot(send, status));
  const sheet = openSheet(t("explore.requests.askBook"), null, { content: form });
  const pickNamed = (on) => {
    named.hidden = !on;
    if (on) requestAnimationFrame(() => bookTitle.focus({ preventScroll: true }));
  };
  const drawShelf = (books) => {
      // Only what can be asked for is a choice: a shelf book not in this language yet, or one that isn't on the shelf. The ones already in it
      // are one line, leading to Read, where they are.
      const inIt = (b) => b.layers.includes(lang) || b.lang === lang;
      const askable = books.filter((b) => !inIt(b));
      const already = books.length - askable.length;
      const pick = (value) => {
        chosen = value;
        pickNamed(value === "named");
        status.replaceChildren();
      };
      const rows = [
        ...askable.map((b) => ui.radioRow({ title: b.title, sub: b.author ?? undefined, name: "ask-book", value: b.id, checked: false, onchange: pick })),
        ui.radioRow({ title: t("explore.requests.notOnShelf"), sub: t("explore.requests.notOnShelfSub"), name: "ask-book", value: "named", checked: !askable.length, onchange: pick }),
      ];
      if (!askable.length) pick("named");
      choices.replaceChildren(
        ui.pickList(askable.length ? t("explore.requests.fromShelf", { language: name }) : t("explore.requests.whichBook"), rows),
        ...(already ? [el("p", { class: "lx-small lx-muted" }, t("explore.requests.already", { count: already, language: name }), " ", el("a", { href: "#read", class: "lx-link" }, t("explore.requests.readThem")))] : []),
      );
  };
  // The board fetched the shelf as it opened: here it's drawn with the sheet. If it hasn't come yet, its place is held until it does.
  if (shelfKnown) drawShelf(shelfKnown);
  else {
    choices.replaceChildren(ui.skeleton({ height: 160 }));
    loadShelf().then(drawShelf, (error) => choices.replaceChildren(ui.loadFailed(error, () => (sheet.close({ animate: false }), bookSheet(lang, { msg })))));
  }
  sendOnce(send, async () => {
    if (!chosen) return status.replaceChildren(t("explore.requests.chooseBook"));
    let book;
    let title;
    if (chosen === "named") {
      if (bookTitle.value.trim().length < 2) return status.replaceChildren(t("explore.requests.giveTitle"));
      book = { title: bookTitle.value.trim(), ...(bookAuthor.value.trim() ? { author: bookAuthor.value.trim() } : {}), ...(bookSource.value.trim() ? { source: bookSource.value.trim() } : {}) };
      title = book.title;
    } else {
      book = chosen;
      title = (shelfKnown ?? []).find((b) => b.id === chosen)?.title ?? chosen;
    }
    // A request is named by what it asks for: the book's own title (the server wants three letters at least).
    return asked(sheet, { msg, form, send, status }, {
      kind: "book",
      language: lang,
      title: title.length >= 3 ? title : `${title} (${name})`,
      book,
      ...(details.value.trim() ? { details: details.value.trim() } : {}),
    });
  });
}

// ---------- one request ----------

const REPORT_REASONS = [
  ["spam", "Spam, or not a real request", "Junk, ads, or something that isn't asking for a pack or a book."],
  ["abuse", "Abuse or hate", "Harassment, hate, threats, or sexual content."],
  ["personal", "Personal information", "Someone's address, phone number or private details."],
  ["minors", "It involves a child", "Anything sexual or harmful involving a minor. It's hidden at once."],
  ["illegal", "It's illegal", "Something unlawful to share. It's hidden at once while it's looked at."],
  ["other", "Something else", "Say what in the details."],
];
function reportSheet(r, { settle, gone }) {
  let reason = null;
  const details = el("textarea", { part: "text-field", rows: 3, maxlength: 2000, placeholder: "What's wrong with it (optional)", "aria-label": "Details" });
  const send = ui.button("Send report", { variant: "go", block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const reasons = reasonPicker(REPORT_REASONS, "request-report-reason", (value) => (reason = value));
  const sheet = openSheet("Report this request", null, { content: el("div", { class: "lx-stack" }, reasons, details, el("p", { class: "lx-small lx-muted" }, "A request that's merely odd or hard to answer isn't for reporting."), ui.pinnedActions([send], { status })) });
  sendOnce(send, async () => {
    if (!reason) return status.replaceChildren("Pick a reason first.");
    try {
      const answer = await post(`/api/community/requests/${encodeURIComponent(r.id)}/report`, { reason, ...(details.value.trim() ? { details: details.value.trim() } : {}) });
      sheet.close({ animate: false });
      // Hidden at once (minors, illegal content, or the reports that hide it): nobody sees it now, so nothing of it stays here.
      if (answer.hidden) gone("Thanks. It's hidden while it's looked at.");
      else await settle("Thanks. It's with the moderators.");
      return true;
    } catch (error) {
      status.replaceChildren(wordsFor(error));
    }
  });
}

/** Answering a pack request with one of your live shared packs in its language (one that answers it already isn't offered). */
async function answerSheet(r, { msg, settle }) {
  let mine;
  try {
    mine = await api("/api/community/mine");
  } catch (error) {
    return msg.fail(wordsFor(error), () => answerSheet(r, { msg, settle }));
  }
  const answered = new Set(r.answeredBy.map((a) => a.item));
  const offered = mine.filter((i) => i.state === "live" && i.language === r.language && !answered.has(i.id));
  const status = el("p", { class: "lx-small", role: "status" });
  let busy = false;
  // Answering with one; if it can't go, Retry answers with the same one again.
  const answerWith = async (i) => {
    if (busy) return;
    busy = true;
    try {
      await post(`/api/community/requests/${encodeURIComponent(r.id)}/answers`, { item: i.id });
      sheet.close({ animate: false });
      await settle(`Answered: “${i.title}” is under the request now.`);
    } catch (error) {
      status.replaceChildren(ui.retryLine(wordsFor(error), () => answerWith(i)));
    } finally {
      busy = false;
    }
  };
  const rows = offered.map((i) =>
    ui.listRow({
      icon: "cards",
      title: i.title,
      sub: [i.level ? `Level ${i.level}` : null, i.follows ? plural(i.follows, "follower") : null].filter(Boolean).join(" · ") || undefined,
      onclick: () => answerWith(i),
    }),
  );
  const content = el(
    "div",
    { class: "lx-stack" },
    offered.length
      ? el("ul", { part: "list" }, rows)
      : el("p", { class: "lx-small" }, `You haven't shared a pack in ${languageName(r.language)} that could answer it.`),
    status,
  );
  const sheet = openSheet("Answer with a pack of yours", null, { content });
}

export function renderRequest(page, id) {
  const msg = message();
  // Tinta, at the start of the page's actions where there's something for it (Me too): one for the page, moved into
  // each redraw's actions, so it keeps its act through the redraw a write brings.
  const tinta = ui.character({ size: 36, hidden: true });
  // On your own request: an answer new since you last looked arrives with Tinta as a paper plane, once; then it stays.
  let arrived = false;
  const body = el("div", { class: "lx-stack" }, ui.loadingState());
  page.replaceChildren(body);
  let stale = false;
  let loads = 0;
  /**
   * After a write that went through (said: what it did): the page drawn again from what the server says now. If it
   * can't be, the confirmation stays, with Look again: a read only, never the write again, offered again for as long
   * as reading fails. Resolves to whether the page is up to date.
   */
  const settle = async (said) => {
    if (await load(true)) {
      msg.say(said, "right");
      return true;
    }
    const again = ui.button("Look again", { size: "sm" });
    sendOnce(again, () => settle(said));
    msg.say(`${said} This page couldn't be brought up to date.`);
    msg.append(" ", again);
    return false;
  };
  // An action, then settle; its button stays off from then on (true): the redraw replaces it.
  const act = async (fn, said) => {
    try {
      await fn();
    } catch (error) {
      // The page's own Tinta acts it out when it's here (one Tinta a screen); else the line has its own.
      msg.fail(wordsFor(error), () => act(fn, said), { tinta: tinta.isConnected ? tinta : null });
      return false;
    }
    await settle(said);
    return true;
  };
  const gone = (text) => {
    loads++; // anything still loading draws nothing now
    body.replaceChildren(ui.emptyState(text, { pose: "shrug" }), ui.button("Back to the requests", { onclick: () => (location.hash = "#explore/requests") }));
  };
  const draw = (r) => {
    const facts = [r.kind === "book" ? "A book" : "A pack", languageName(r.language), r.level ? `Level ${r.level}` : null, r.topic?.name ?? null, `by ${r.mine ? "you" : r.by}`, ago(r.at)].filter(Boolean).join(" · ");
    const book =
      r.kind === "book"
        ? r.book.onShelf
          ? r.book.layer
            ? `${r.book.title} is on the shelf in ${languageName(r.language)} now: read it in Read.`
            : `${r.book.title}, on the shelf; not in ${languageName(r.language)} yet.`
          : `${r.book.title}${r.book.author ? `, by ${r.book.author}` : ""}${r.book.source ? ` (${r.book.source})` : ""}: not on the shelf yet.`
        : null;
    const where =
      r.state === "pending"
        ? "Waiting for an admin: a book has to be cleared for the shelf first (public domain in the US and the EU, or openly licensed)."
        : r.state === "open"
          ? null
          : `${STATE_WORDS[r.state]}${r.stateNote ? `: ${r.stateNote}` : "."}`;
    const open = r.state === "open" && !r.shown;
    const fresh = r.mine && r.answeredBy.some((a) => a.new);
    const planeNow = fresh && !arrived;
    if (fresh) arrived = true;
    const buttons = [];
    if (open && !r.mine && (mayShare() || r.liked)) {
      const meToo = ui.button(r.likes ? `Me too · ${r.likes}` : "Me too", { size: "lg", pressed: r.liked ? "true" : "false" });
      sendOnce(meToo, () => {
        // Saying it (not taking it back): Tinta's drop lands on the button as a seal, while the press does its work.
        if (!r.liked) ui.stampCharacter(tinta, meToo);
        return act(() => (r.liked ? del : post)(`/api/community/requests/${encodeURIComponent(r.id)}/like`), r.liked ? "Taken back." : "Me too: it's counted.");
      });
      buttons.push(meToo);
    }
    if (open && !r.mine && r.kind === "pack" && mayShare()) buttons.push(ui.button("Answer", { variant: "go", size: "lg", block: true, onclick: () => answerSheet(r, { msg, settle }) }));
    if (r.mine && r.state === "open") {
      const doneButton = ui.button("Mark done", { variant: "go", size: "lg", block: true });
      sendOnce(doneButton, () => act(() => post(`/api/community/requests/${encodeURIComponent(r.id)}/close`, { state: "done" }), "Marked done."));
      buttons.push(doneButton);
    }
    if (r.mine && (r.state === "done" || r.state === "closed") && mayShare()) {
      const again = ui.button("Open again", { size: "lg" });
      sendOnce(again, () => act(() => post(`/api/community/requests/${encodeURIComponent(r.id)}/close`, { state: "open" }), "Open again."));
      buttons.push(again);
    }
    const moreRows = [
      ...(r.mine && (r.state === "open" || r.state === "pending")
        ? [
            ui.listRow({
              icon: "cross",
              title: "Close it",
              sub: "It isn't wanted now; you can open it again",
              onclick: () => {
                sheet?.close({ animate: false });
                act(() => post(`/api/community/requests/${encodeURIComponent(r.id)}/close`, { state: "closed" }), "Closed.");
              },
            }),
          ]
        : []),
      ...(!r.mine && !r.shown ? [ui.listRow({ icon: "info", title: "Report", sub: "Spam, abuse or personal details in what it says", opens: "sheet", onclick: () => (sheet?.close({ animate: false }), reportSheet(r, { settle, gone })) })] : []),
    ];
    let sheet = null;
    if (moreRows.length) buttons.push(ui.button("More", { size: "lg", onclick: () => (sheet = openSheet("More", moreRows)) }));
    const answers = r.answeredBy.map((a) =>
      ui.listRow({ icon: "cards", title: a.title, sub: [a.new ? "New" : null, `by ${a.by}`, a.level ? `Level ${a.level}` : null, a.likes ? `♥ ${a.likes}` : null, ago(a.at)].filter(Boolean).join(" · "), href: itemHref(a.item) }),
    );
    body.replaceChildren(
      ...[
        ui.pageTitle(r.title),
        el("p", { class: "lx-small lx-muted lx-explore-facts" }, ui.languageFlag(r.language), facts),
        r.shown ? el("p", { class: "lx-small" }, r.shownReason ?? "Hidden after a report: only you see it.") : null,
        where ? el("p", { class: "lx-small" }, where) : null,
        r.details ? el("p", {}, r.details) : null,
        book ? el("p", { class: "lx-small" }, book) : null,
        r.kind === "pack"
          ? ui.group(
              "Answers",
              answers.length ? answers : [ui.listRow({ icon: "cards", title: "No answers yet", sub: "When someone shares a pack for it, it shows here" })],
            )
          : null,
        msg,
        buttons.length ? ui.pinnedActions((open && !r.mine) || arrived ? [tinta, ...buttons] : buttons) : null,
      ].filter(Boolean),
    );
    if (planeNow && tinta.isConnected) ui.planeCharacter(tinta, "in");
  };
  // Only the latest load draws (one after an action may overtake an earlier one); opening it marks its answers seen.
  // Resolves to whether the page is now as the server has it (an overtaken load leaves that to the newer one). A load
  // after a write says nothing itself: settle does.
  async function load(again = false) {
    const mineNow = ++loads;
    try {
      const r = await api(`/api/community/requests/${encodeURIComponent(id)}`);
      if (stale || mineNow !== loads) return true;
      draw(r);
      return true;
    } catch (error) {
      if (stale || mineNow !== loads) return true;
      if (!again) body.replaceChildren(ui.loadFailed(error, () => load(), { offline: "This request needs a connection. It'll come back by itself once you're online." }));
      return false;
    }
  }
  load();
  return { title: "Explore", back: { href: "#explore/requests", label: "Requests" }, dispose: () => (stale = true) };
}
