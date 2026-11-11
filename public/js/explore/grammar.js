// A language's shared grammar in Explore (src/grammar-suggestions.ts; lang/grammar.js; the plan is
// ../docs/design/grammar-as-data/README.md): the patterns every pack, weave and grade of the language shares, where each
// is from, and suggestions to them: a new pattern, a fix to one, retiring one. Anyone signed in suggests (or their AI,
// suggest_pattern), others like them, and an admin accepts or declines them over MCP. explore.js routes here:
//   #explore/grammar?lang             the grammar: its patterns in the order to learn them, and new ones suggested
//   #explore/pattern/<lang>/<id>      one pattern: its explanation, what it builds on, where it's from, sentences of
//                                     your packs that show it, and the suggestions waiting on it
// and draws the home's row (grammarRow) and Yours' suggestions (yourSuggestions). Every server value goes into the page
// as text (el), never as markup.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { api } from "../shell/api.js";
import { reasonPicker, termsFirst } from "./terms.js";
import { mayShare } from "../shell/sharing.js";
import { LANGUAGES, languageName } from "../lang/index.js";
import { GRAMMAR_LIMITS, KNOWS, SUGGESTION_LIMITS, grammarNow } from "../lang/grammar.js";
import { learning } from "../study/learning.js";
import { ITEMS, contentLanguage, sentence } from "../study/content.js";
import { lookToast } from "../shell/look-watch.js";

const learnable = (code) => typeof code === "string" && code !== "en" && Object.hasOwn(LANGUAGES, code);
const grammarHref = (lang) => `#explore/grammar?lang=${encodeURIComponent(lang)}`;
const patternHref = (lang, id) => `#explore/pattern/${encodeURIComponent(lang)}/${encodeURIComponent(id)}`;
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const ago = (iso) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString();
};
const STATE_WORDS = { open: "Waiting for an admin", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn", superseded: "Superseded" };
const KIND_WORDS = { new: "A new pattern", fix: "A fix", retire: "Retire it" };
const REPORT_REASONS = [
  ["spam", "Spam, or not a real suggestion", "Junk, ads, or something that isn't about the grammar."],
  ["abuse", "Abuse or hate", "Harassment, hate, threats, or sexual content."],
  ["personal", "Personal information", "Someone's address, phone number or private details."],
  ["minors", "It involves a child", "Anything sexual or harmful involving a minor. It's hidden at once."],
  ["illegal", "It's illegal", "Something unlawful to share. It's hidden at once while it's looked at."],
  ["other", "Something else", "Say what in the details."],
];

/** What went wrong with a request to the server, in words (one that can't reach it too). */
const wordsFor = (error) => (error instanceof TypeError ? "Lexicommons couldn't be reached. Try again in a moment." : error.message);
/** A write to the server: { ok, answer }, never a throw (the answer's words say what went wrong). */
async function submit(method, path, body) {
  let response;
  try {
    response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { ok: false, answer: { error: "Lexicommons couldn't be reached. Try again in a moment." } };
  }
  if (response.status === 401) location.assign(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`);
  return { ok: response.ok, answer: await response.json().catch(() => ({})) };
}
// The server's words, never a code (internal_error) on a screen.
const problemOf = (answer) => (typeof answer.error === "string" && answer.error && !/^[a-z]+(_[a-z]+)+$/.test(answer.error) ? answer.error : null) ?? (Array.isArray(answer.problems) && answer.problems.length ? answer.problems.join(" ") : "Something went wrong.");
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
/** A sheet over the page (ui.sheetLayer, as Explore's). */
function openSheet(label, rows, { content } = {}) {
  const layer = ui.sheetLayer({ label });
  layer.lxBody.replaceChildren(el("h2", { class: "lx-sheet-title" }, label), content ?? el("ul", { part: "list" }, rows));
  layer.lxOpen();
  return { close: (options) => layer.lxClose(options) };
}
/** A status line: what came of a press, in words. */
const message = () => {
  const node = el("p", { class: "lx-settings-message", role: "status" });
  node.say = (text, tone) => {
    node.replaceChildren(text ?? "");
    if (tone) node.setAttribute("data-tone", tone);
    else node.removeAttribute("data-tone");
  };
  return node;
};

/**
 * The grammar's patterns in the order to learn them (as the grammar map hangs them): each under the first pattern it
 * builds on, the ones that build on none first. [{ id, depth }]
 */
export function patternOrder(patterns) {
  const ids = Object.keys(patterns);
  const children = new Map(ids.map((id) => [id, []]));
  const roots = [];
  for (const id of ids) {
    const parent = (patterns[id].after ?? []).find((other) => other !== id && children.has(other));
    if (parent) children.get(parent).push(id);
    else roots.push(id);
  }
  const out = [];
  const seen = new Set();
  const walk = (id, depth) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, depth });
    for (const child of children.get(id)) walk(child, depth + 1);
  };
  for (const id of roots) walk(id, 0);
  for (const id of ids) walk(id, 0); // a loop (never published, but never lost)
  return out;
}

/** Where a pattern is from, in a line: who drafted it, reviewed it and accepted it, and when. */
export const sourceLine = (source = {}) =>
  [source.note?.includes(source.by) ? null : source.by, source.drafted ? `drafted ${/^(by|with) /.test(source.drafted) ? source.drafted : `by ${source.drafted}`}` : null, source.reviewed ? `reviewed: ${source.reviewed}` : null, source.accepted ? `accepted by ${source.accepted}` : null, source.at, source.note]
    .filter(Boolean)
    .join(" · ");

/** Explore home's way in, under Requests: static (no fetch), so the home still draws whole from the device. */
export const grammarRow = (lang) =>
  ui.group(null, [ui.listRow({ icon: "book", title: `${languageName(lang)} grammar`, href: grammarHref(lang) })]);

/** A suggestion, as a line: who suggested it (how they know the language, with their AI), its likes, when. */
const bySub = (s) =>
  [s.mine ? "by you" : s.by ? `by ${s.by}` : null, KNOWS[s.knows], s.likes ? plural(s.likes, "like") : null, ago(s.at)].filter(Boolean).join(" · ");

/** Yours' suggestions: each of yours, newest first, whatever became of it. Resolves to a section. */
export async function yourSuggestions() {
  const mine = await api("/api/community/grammar-suggestions/mine");
  if (!mine.length) return null; // with none, Yours keeps the way to a grammar under More
  return ui.group(
    "Your suggestions to a grammar",
    mine.length
      ? mine.map((s) =>
          ui.listRow({
            icon: s.kind === "new" ? "plus" : s.kind === "retire" ? "cross" : "pencil",
            title: `${KIND_WORDS[s.kind]}: ${s.change.name ?? s.pattern}`,
            sub: [languageName(s.language), s.shown ? (s.shownReason ?? "Hidden after a report") : null, s.state === "accepted" ? `Accepted, in revision ${s.revision}` : STATE_WORDS[s.state], s.why ?? null, ago(s.at)].filter(Boolean).join(" · "),
            href: s.kind === "new" && s.state !== "accepted" ? grammarHref(s.language) : patternHref(s.language, s.pattern),
          }),
        )
      : [ui.listRow({ icon: "book", title: `${languageName(learning())} grammar`, sub: "Suggest a pattern, or a fix to one", href: grammarHref(learning()) })],
  );
}

// ---------- a suggestion: its row, its sheet, reporting it ----------

/** What a suggestion proposes, in words: a new pattern's name, a fix's changes, or retiring. */
function proposal(s, patterns) {
  const now = patterns?.[s.pattern];
  const parts = [];
  if (s.change.name !== undefined) parts.push(el("p", {}, el("strong", {}, s.kind === "new" ? s.change.name : `Name: ${s.change.name}`)));
  if (s.change.about !== undefined) parts.push(el("p", {}, s.change.about));
  if (s.change.short !== undefined) parts.push(el("p", {}, `The rule in one sentence: ${s.change.short}`));
  if (s.change.chip !== undefined) parts.push(el("p", {}, `Short name: ${s.change.chip}`));
  if (s.change.after !== undefined) parts.push(el("p", { class: "lx-small lx-muted" }, s.change.after.length ? `Builds on: ${s.change.after.map((id) => patterns?.[id]?.name ?? id).join(", ")}` : "Builds on nothing else"));
  if (s.kind === "retire") parts.push(el("p", {}, `Stop offering “${now?.name ?? s.pattern}” to new packs. What uses it keeps working.`));
  if (s.kind === "fix" && now && s.change.about !== undefined) parts.push(el("p", { class: "lx-small lx-muted" }, `Now: ${now.about}`));
  if (s.note) parts.push(el("p", { class: "lx-small" }, `“${s.note}”`));
  return parts;
}

function suggestionRow(s, ctx) {
  return ui.listRow({
    icon: s.kind === "new" ? "plus" : s.kind === "retire" ? "cross" : "pencil",
    title: s.kind === "new" ? `${KIND_WORDS.new}: ${s.change.name}` : s.kind === "retire" ? KIND_WORDS.retire : `${KIND_WORDS.fix}: ${s.change.name ?? (s.change.about ? "its explanation" : "what it builds on")}`,
    sub: [s.shown ? (s.shownReason ?? "Hidden after a report: only you see it") : null, s.state !== "open" ? STATE_WORDS[s.state] : null, bySub(s)].filter(Boolean).join(" · "),
    onclick: () => suggestionSheet(s, ctx),
  });
}

/** One suggestion in a sheet: all it says, and what you can do with it (like it, withdraw yours, report it). */
function suggestionSheet(s, ctx) {
  let sheet = null;
  const close = () => sheet?.close({ animate: false });
  let busy = false;
  const once = (fn) => async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };
  const after = async (ok, answer, said) => {
    close();
    if (!ok) return ctx.msg.say(problemOf(answer), "wrong");
    ctx.msg.say(said, "right");
    await ctx.reload();
  };
  const open = s.state === "open" && !s.shown;
  const actions = [
    open && !s.mine
      ? ui.listRow({
          icon: "sparkle",
          title: s.liked ? "Unlike it" : "Like it",
          sub: "An admin sees how many want it",
          onclick: once(async () => {
            const { ok, answer } = await submit(s.liked ? "DELETE" : "POST", `/api/community/grammar-suggestions/${encodeURIComponent(s.id)}/like`);
            await after(ok, answer, s.liked ? "Unliked." : "Liked.");
          }),
        })
      : null,
    open && s.mine
      ? ui.listRow({
          icon: "trash",
          title: "Take it back",
          sub: "Withdraw your suggestion",
          onclick: once(async () => {
            const { ok, answer } = await submit("POST", `/api/community/grammar-suggestions/${encodeURIComponent(s.id)}/withdraw`);
            await after(ok, answer, "Taken back.");
          }),
        })
      : null,
    !s.mine && !s.shown && open
      ? ui.listRow({
          icon: "info",
          title: "Report it",
          sub: "Spam, abuse or personal details in what it says. A wrong one is for an admin to decline, not to report",
          onclick: () => {
            close();
            reportSheet(s, ctx);
          },
        })
      : null,
  ].filter(Boolean);
  sheet = openSheet(s.kind === "new" ? KIND_WORDS.new : s.kind === "retire" ? "Retire this pattern" : "A fix to this pattern", null, {
    content: el(
      "div",
      { class: "lx-stack" },
      ...proposal(s, ctx.patterns),
      el("p", { class: "lx-small lx-muted" }, [s.state === "accepted" ? `Accepted, in revision ${s.revision}` : STATE_WORDS[s.state], s.why ?? null, bySub(s)].filter(Boolean).join(" · ")),
      actions.length ? el("ul", { part: "list" }, actions) : null,
    ),
  });
}

function reportSheet(s, ctx) {
  let reason = null;
  const details = el("textarea", { part: "text-field", rows: 3, maxlength: 2000, placeholder: "What's wrong with it (optional)", "aria-label": "Details" });
  const send = ui.button("Send report", { variant: "go", block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const reasons = reasonPicker(REPORT_REASONS, "grammar-report-reason", (value) => (reason = value));
  const sheet = openSheet("Report this suggestion", null, { content: el("div", { class: "lx-stack" }, reasons, details, ui.pinnedActions([send], { status })) });
  sendOnce(send, async () => {
    if (!reason) return status.replaceChildren("Pick a reason first.");
    const { ok, answer } = await submit("POST", `/api/community/grammar-suggestions/${encodeURIComponent(s.id)}/report`, { reason, ...(details.value.trim() ? { details: details.value.trim() } : {}) });
    if (!ok) return status.replaceChildren(problemOf(answer));
    sheet.close({ animate: false });
    ctx.msg.say(answer.hidden ? "Thanks. It's hidden while it's looked at." : "Thanks. It's with the moderators.", "right");
    await ctx.reload();
    return true;
  });
}

// ---------- suggesting ----------

/**
 * The form for a suggestion, in a sheet: a new pattern (its name, its explanation, what it builds on), a fix to one
 * (the same, as it is now, to change), or retiring one; how you know the language; why. The choice of what it builds on
 * is shown in the sheet in the form's place, with Back (one sheet is up at a time). Every problem the server finds
 * comes back at once, beside Send.
 */
function suggestSheet({ lang, kind, pattern, patterns, ctx }) {
  const now = pattern ? patterns[pattern] : null;
  const state = { knows: null, after: new Set(now?.after ?? []) };
  const name = el("input", { part: "text-field", maxlength: GRAMMAR_LIMITS.name, value: now?.name ?? "", placeholder: "Its name, in English: zelf for emphasis", "aria-label": "Its name" });
  const about = el("textarea", {
    part: "text-field",
    rows: 4,
    maxlength: GRAMMAR_LIMITS.about,
    placeholder: "One to three plain sentences, with an example and its literal gloss: ik doe het zelf (I do it self).",
    "aria-label": "Its explanation",
  });
  about.value = now?.about ?? "";
  const short = el("textarea", { part: "text-field", rows: 2, maxlength: GRAMMAR_LIMITS.short, placeholder: "The rule in one sentence (optional).", "aria-label": "The rule in one sentence" });
  short.value = now?.short ?? "";
  const note = el("textarea", { part: "text-field", rows: 2, maxlength: SUGGESTION_LIMITS.note, placeholder: "Why (optional)", "aria-label": "Why" });
  const knows = Object.entries(KNOWS).map(([value, words]) => ui.radioRow({ title: `I'm ${words}`, name: "grammar-knows", value, onchange: () => (state.knows = value) }));
  const send = ui.button(kind === "retire" ? "Suggest retiring it" : "Send the suggestion", { variant: "go", block: true, block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const picker = el("div", { class: "lx-stack", hidden: true });
  const others = patternOrder(patterns).filter(({ id }) => id !== pattern && !patterns[id].retired);
  const afterWords = () => (state.after.size ? [...state.after].map((id) => patterns[id]?.name ?? id).join(", ") : "Nothing else");
  const afterRow = ui.listRow({ icon: "tag", title: "Builds on", value: afterWords(), onclick: () => chooseAfter() });
  const chooseAfter = () => {
    const back = ui.backButton({
      label: "Back",
      onclick: () => {
        picker.hidden = true;
        form.hidden = false;
        afterRow.querySelector(".lx-row-value")?.replaceChildren(afterWords());
      },
    });
    picker.replaceChildren(
      back,
      el("p", { class: "lx-small lx-muted" }, `What it builds on (up to ${GRAMMAR_LIMITS.after})`),
      el(
        "ul",
        { part: "list" },
        ...others.map(({ id }) => ui.switchRow({ title: patterns[id].name, checked: state.after.has(id), onchange: (on) => (on ? state.after.add(id) : state.after.delete(id)) })),
      ),
    );
    form.hidden = true;
    picker.hidden = false;
  };
  const fields =
    kind === "retire"
      ? [el("p", {}, `Stop offering “${now.name}” to new packs. Sentences that use it keep working, and so does everyone's progress on it.`)]
      : [el("label", { class: "lx-small lx-muted" }, "Name"), name, el("label", { class: "lx-small lx-muted" }, "Explanation, shown after every answer"), about, el("label", { class: "lx-small lx-muted" }, "The rule in one sentence"), short, el("ul", { part: "list" }, afterRow)];
  const form = el(
    "div",
    { class: "lx-stack" },
    ...fields,
    el("p", { class: "lx-small lx-muted" }, `How you know ${languageName(lang)}`),
    el("ul", { part: "list" }, knows),
    note,
    el("p", { class: "lx-small lx-muted" }, "An admin of Lexicommons accepts or declines it; what's accepted goes to everyone learning the language, under CC BY-SA 4.0. The grammar says how you know the language, never who you are."),
    ui.pinnedActions([send], { status }),
  );
  const sheet = openSheet(kind === "new" ? "Suggest a new pattern" : kind === "retire" ? "Suggest retiring it" : "Suggest a fix", null, { content: el("div", {}, form, picker) });
  sendOnce(send, async () => {
    if (!state.knows) return status.replaceChildren(`Say how you know ${languageName(lang)} first.`);
    const body = { kind, knows: state.knows, ...(pattern ? { pattern } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}) };
    if (kind !== "retire") {
      body.name = name.value;
      body.about = about.value;
      if (short.value.trim()) body.short = short.value;
      body.after = [...state.after];
    }
    if (!(await termsFirst(form, { from: send }))) return;
    const { ok, answer } = await submit("POST", `/api/community/grammar/${encodeURIComponent(lang)}/suggestions`, body);
    if (!ok || !answer.suggested) return status.replaceChildren(problemOf(answer));
    sheet.close({ animate: false });
    ctx.msg.say("Sent: it waits for an admin. Your suggestions are in Explore → Share what you've made.", "right");
    await ctx.reload();
    return true;
  });
}

// ---------- the pages ----------

// The grammar list's last answer from the server, per language, for this visit of the app: coming back to the list (a swipe back from a
// pattern) draws it in its first frame.
const grammarAnswers = new Map();

export function renderGrammar(page, params = {}) {
  const lang = learnable(params.lang) ? params.lang : learning();
  const msg = message();
  const body = el("div", { class: "lx-stack" });
  // The patterns, in the order to learn them: the page's one thing. Its revision is the title's line; suggestions waiting
  // show above the list only when there are some.
  const title = ui.pageTitle(`${languageName(lang)} grammar`);
  page.replaceChildren(title, body);
  let stale = false;
  let loads = 0;
  let drawnKey = null;
  const ctx = { msg, patterns: {}, reload: () => load() };
  // What's drawn, from an answer: the server's ({ revision, patterns, waiting } and its suggestions), or the device's own grammar before it.
  const draw = (grammar, suggestions) => {
    const key = JSON.stringify([grammar.revision, Object.entries(grammar.patterns).map(([id, p]) => [id, p.name, Boolean(p.retired), (p.after ?? []).join()]), grammar.waiting ?? {}, suggestions.map((s) => [s.id, s.kind, s.state]), mayShare()]);
    // The same as what's on the page: it stays as it is (drawn again, every row was new and the page's scroll lost its place).
    if (key === drawnKey) return;
    drawnKey = key;
    ctx.patterns = grammar.patterns;
    const order = patternOrder(grammar.patterns);
    const rows = order.map(({ id }) => {
      const p = grammar.patterns[id];
      const waiting = grammar.waiting?.[id] ?? 0;
      // A pattern's name, and a line only when there's news: retired, or suggestions waiting. What it builds on and where
      // it's from are on its page; the list is in the order to learn them.
      return ui.listRow({
        title: p.name,
        sub: [p.retired ? "Retired" : null, waiting ? `${plural(waiting, "suggestion")} waiting` : null].filter(Boolean).join(" · ") || undefined,
        href: patternHref(lang, id),
      });
    });
    const fresh = suggestions.filter((s) => s.kind === "new");
    const suggest = !mayShare() ? null : ui.button("Suggest a new pattern", { size: "lg", block: true, icon: "plus", onclick: () => suggestSheet({ lang, kind: "new", patterns: grammar.patterns, ctx }) });
    title.querySelector("p")?.remove();
    title.append(el("p", { class: "lx-muted" }, `Revision ${grammar.revision}: ${plural(order.length, "pattern")}.`));
    body.replaceChildren(
      ...(fresh.length ? [ui.group("New patterns suggested", fresh.map((s) => suggestionRow(s, ctx)))] : []),
      ui.group(fresh.length ? "Patterns" : null, rows),
      msg,
      ...(suggest ? [ui.pinnedActions([suggest])] : []),
    );
  };
  async function load() {
    const mine = ++loads;
    try {
      const [grammar, suggestions] = await Promise.all([api(`/api/community/grammar/${encodeURIComponent(lang)}`), api(`/api/community/grammar/${encodeURIComponent(lang)}/suggestions`)]);
      if (stale || mine !== loads) return;
      grammarAnswers.set(lang, { grammar, suggestions });
      draw(grammar, suggestions);
    } catch (error) {
      // Drawn from the device or from before, it stays; only a page with nothing says what went wrong.
      if (!stale && mine === loads && !drawnKey) body.replaceChildren(el("div", { part: "empty-state" }, wordsFor(error)));
    }
  }
  // In its first frame: this visit's last answer, else the grammar this device has installed (the same patterns, no suggestions yet).
  const kept = grammarAnswers.get(lang);
  const device = grammarNow(lang);
  if (kept) draw(kept.grammar, kept.suggestions);
  else if (device) draw({ revision: device.revision, patterns: device.patterns, waiting: {} }, []);
  else body.replaceChildren(ui.loadingState());
  load();
  return { title: "Explore", back: { href: "#explore", label: "Explore" }, ready: Promise.resolve(), dispose: () => (stale = true) };
}

/**
 * Suggesting a fix to one of a language's patterns from where it's met (explore/suggest-way.js, Knowledge's idea sheets): the same sheet as
 * the pattern's page here, on the grammar this device has, and its answer said in a toast (there's no page under it to say it or draw again).
 */
export function suggestFix(lang, id) {
  const grammar = grammarNow(lang);
  if (!grammar?.patterns?.[id] || grammar.patterns[id].retired) return;
  suggestSheet({ lang, kind: "fix", pattern: id, patterns: grammar.patterns, ctx: { msg: { say: (text, tone) => lookToast(tone ?? "info", text) }, patterns: grammar.patterns, reload: () => {} } });
}

export function renderPattern(page, lang, id) {
  const msg = message();
  const body = el("div", { class: "lx-stack" }, ui.loadingState());
  page.replaceChildren(body);
  let stale = false;
  let loads = 0;
  const ctx = { msg, patterns: {}, reload: () => load() };
  async function load() {
    const mine = ++loads;
    try {
      if (!learnable(lang)) throw new Error("There's no such language here.");
      const [grammar, suggestions] = await Promise.all([
        api(`/api/community/grammar/${encodeURIComponent(lang)}`),
        api(`/api/community/grammar/${encodeURIComponent(lang)}/suggestions?${new URLSearchParams({ pattern: id, decided: "1" })}`),
      ]);
      if (stale || mine !== loads) return;
      const p = grammar.patterns[id];
      if (!p) {
        body.replaceChildren(ui.emptyState(`${languageName(lang)}'s grammar has no pattern “${id}”.`, { pose: "shrug" }), ui.button("Back to the grammar", { onclick: () => (location.hash = grammarHref(lang)) }));
        return;
      }
      ctx.patterns = grammar.patterns;
      // Sentences of your packs that show it, when it's the language you're learning (content.js has its packs).
      const examples = contentLanguage() === lang ? ITEMS.filter((item) => item.concepts.includes(id)).slice(0, 3) : [];
      const open = suggestions.filter((s) => s.state === "open");
      const decided = suggestions.filter((s) => s.state !== "open");
      // The rule and its sentences are the page; a fix is its one action, retiring it (rare) a row further down.
      const fix = p.retired || !mayShare() ? null : ui.button("Suggest a fix", { size: "lg", block: true, icon: "pencil", onclick: () => suggestSheet({ lang, kind: "fix", pattern: id, patterns: grammar.patterns, ctx }) });
      const retire = p.retired || !mayShare() ? null : ui.listRow({ icon: "cross", title: "Suggest retiring it", onclick: () => suggestSheet({ lang, kind: "retire", pattern: id, patterns: grammar.patterns, ctx }) });
      body.replaceChildren(
        ...[
          ui.pageTitle(p.name),
          p.retired ? el("p", { class: "lx-small" }, "Retired: no longer offered to new packs. What uses it keeps working.") : null,
          el("p", {}, p.about),
          examples.length ? ui.group("In your packs", examples.map((item) => ui.listRow({ title: el("span", { lang }, sentence(item)), sub: item.means }))) : null,
          open.length ? ui.group("Suggestions waiting", open.map((s) => suggestionRow(s, ctx))) : null,
          p.after.length ? el("p", { class: "lx-small lx-muted" }, "Builds on: ", ...p.after.flatMap((other, i) => [i ? ", " : "", el("a", { href: patternHref(lang, other) }, grammar.patterns[other]?.name ?? other)])) : null,
          el("p", { class: "lx-small lx-muted" }, `Where it's from: ${sourceLine(p.source)}`),
          // What's been decided, and retiring it: a press away.
          decided.length || retire
            ? el(
                "details",
                { class: "lx-quiet-more" },
                el("summary", {}, decided.length ? `More: ${plural(decided.length, "decided suggestion")}` : "More"),
                decided.length ? ui.group("Decided", decided.map((s) => suggestionRow(s, ctx))) : null,
                retire ? ui.group(null, [retire]) : null,
              )
            : null,
          msg,
          fix ? ui.pinnedActions([fix]) : null,
        ].filter(Boolean),
      );
    } catch (error) {
      if (!stale && mine === loads) body.replaceChildren(el("div", { part: "empty-state" }, wordsFor(error)));
    }
  }
  load();
  return { title: "Explore", back: { href: grammarHref(lang), label: `${languageName(lang)} grammar` }, dispose: () => (stale = true) };
}
