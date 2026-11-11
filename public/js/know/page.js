// The Knowledge page (#know): what you know as big cards on the one page, scrolled through: Your words (cards.js, the pile; its card opens
// Your words at #know/words, words-page.js), then This week, the ideas you've met, Everyday Dutch and Over time (cards-more.js; their cards
// open #know/everyday/words, everyday-page.js, and #know/time/more, time-page.js),
// with the frequency list's credit at the foot. What's slipping, when something is, as the one way forward over them, and the search. A link
// can open it at a card (#know/<card>). Its own pages: a kind's list by skill (#know/list/<kind>/<skill>), a stretch of the most common words
// (#know/words/<start>), what's worth knowing now (#know/now); a concept's own page is #know/<unit> (concept.js).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { ITEMS, describe, nameLang, onContentChange, shownName } from "../study/content.js";
import { notesReady } from "../study/notes.js";
import { evidenceVersion, unitState } from "../study/progress.js";
import { SKILLS } from "../study/scheduler.js";
import { planSession } from "../study/plan.js";
import { loadFrequency, onFrequency } from "../study/frequency.js";
import { KIND_ORDER, dayOf, knowledge, readNotSaid, searchUnits, unitsBy, wordStrip } from "./summary.js";
import { bankWords } from "../read/bank.js";
import { learning } from "../study/learning.js";
import { minutesOf } from "./today.js";
import { conceptHref, renderConcept } from "./concept.js";
import { pileFree, pileMoving, settleAgain, wordsCard } from "./cards.js";
import { startedWords, stateOf, wordEntries } from "./word-index.js";
import { inSlices, turn, whole } from "./slices.js";
import { renderYourWords } from "./words-page.js";
import { renderWeek } from "./week-page.js";
import { renderIdeas } from "./ideas-page.js";
import { renderEveryday } from "./everyday-page.js";
import { renderTime } from "./time-page.js";
import * as more from "./cards-more.js";
import { t } from "../lx/i18n.js";
import { creditRow, fill, ordinal, knowHighlight, wideButton } from "./ui.js";

const SKILL_LABEL = { read: "Read", hear: "Hear", say: "Say" };
const KIND_TITLE = { word: "Words", pattern: "Patterns", phrase: "Phrases" };
const VERB = { read: "read", hear: "understand when you hear them", say: "say" };
const BACK = { href: "#know", label: "What you know" };

const capital = (text) => text.replace(/^./, (c) => c.toUpperCase());
const said = (lang) => new Set(bankWords(lang));
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const KIND_WORD = { word: "word", pattern: "pattern", phrase: "phrase" };

// Find any word, pattern or phrase: what you type, matched as you type, each result opening its page.
function searchBox(lang) {
  const results = el("ul", { part: "list" });
  const field = el("input", { part: "text-field", type: "search", placeholder: "Find a word, pattern or phrase", "aria-label": "Find a word, pattern or phrase", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false" });
  const show = () => {
    const hits = searchUnits(field.value, { lang, limit: 12 });
    results.replaceChildren(
      ...hits.map((hit) =>
        ui.listRow({
          title: ui.wordLabel(shownName(hit.unit)),
          sub: [hit.en, KIND_WORD[hit.kind], hit.rank ? `${ordinal(hit.rank)} most common` : null, hit.studied ? null : "not studied yet"].filter(Boolean).join(" · "),
          href: conceptHref(hit.unit),
        }),
      ),
      ...(field.value.trim() && !hits.length ? [el("li", { class: "lx-small lx-muted" }, "Nothing matches that yet.")] : []),
    );
  };
  field.addEventListener("input", show);
  return el("div", { class: "lx-know-search", role: "search" }, field, results);
}

// What's worth knowing now: what's slipping, what you can read but can't say yet, what got stronger today. Each with its few words for the row that opens them.
function highlights(k, lang, now) {
  const items = [];
  const says = [];
  const names = (units) => units.slice(0, 8).map((unit) => [shownName(unit), conceptHref(unit), nameLang(unit, lang)]);
  if (k.slipping.length) {
    const plan = planSession("slipping");
    says.push(`${k.slipping.length.toLocaleString()} slipping`);
    items.push(
      knowHighlight({
        icon: "clock",
        meaning: "slipping",
        text: `${plural(k.slipping.length, "thing")} slipping${k.slipping.length > 8 ? `, ${k.slipping.length - 8} more not shown` : ""}. About ${minutesOf(plan)} minutes brings them back.`,
        tags: names(k.slipping).map(([text, href, tagLang]) => [text, href, "slipping", tagLang]),
        action: plan.steps.length ? { label: "Review them", href: "#study/session/slipping?from=know" } : null,
      }),
    );
  }
  if (k.trained.includes("say")) {
    const gap = readNotSaid({ lang, now });
    const total = KIND_ORDER.reduce((sum, kind) => sum + gap[kind].length, 0);
    // A session on the kind with the most to say, when there's something to practice it with.
    const kind = [...KIND_ORDER].sort((a, b) => gap[b].length - gap[a].length)[0];
    const session = total ? planSession("gap", `${kind}/say`) : null;
    if (total) {
      says.push(`${total.toLocaleString()} to say`);
      items.push(
        knowHighlight({
          icon: "mic",
          text: `You can read ${plural(total, "thing")} you can't say yet.`,
          action: session?.steps.length ? { label: "Practice saying them", href: `#study/session/gap/${kind}/say?from=know` } : { label: "See them", icon: "chevron", href: `#know/list/${kind}/say` },
        }),
      );
    }
  }
  if (k.stronger.length) {
    says.push(`${k.stronger.length.toLocaleString()} stronger today`);
    items.push(
      knowHighlight({
        icon: "check",
        meaning: "right",
        text: `${plural(k.stronger.length, "thing")} got stronger today${k.stronger.length > 8 ? `, ${k.stronger.length - 8} more not shown` : ""}.`,
        tags: names(k.stronger).map(([text, href, tagLang]) => [text, href, "right", tagLang]),
      }),
    );
  }
  return { items, says };
}

// The Knowledge page: what you know as big cards on the one page, scrolled through: your words, this week, the ideas you've met, everyday Dutch,
// over time. The search over them, and what's slipping as the one way forward when something is. focus: the card a link opened it at
// (#know/days, #know/everyday, #know/ideas, #know/time), scrolled to on its first draw.
function knowledgePage(page, { asTab, focus = null }) {
  const lang = learning();
  const top = el("div", { class: "lx-stack lx-know-top" });
  const body = el("div", { class: "lx-know-board" });
  fill(page, asTab ? null : ui.pageTitle("What you know"), top, searchBox(lang), body);
  // A link to one card opens the page at it, and keeps it there through the draws that come as the page fills in (the word list arriving
  // grows the cards above it), until you touch or scroll the page yourself.
  let held = false;
  const hold = () => held && body.querySelector(`[data-card="${focus}"]`)?.scrollIntoView({ block: "start" });
  // The shell may hold a new page unseen until it's drawn, then put it at its top: whenever the page shows or grows, the card goes back to the
  // top of the screen.
  const keep = focus ? new ResizeObserver(() => (held ? hold() : keep.disconnect())) : null;
  const letGo = () => {
    held = false;
    keep?.disconnect();
    for (const kind of ["pointerdown", "wheel", "keydown"]) page.removeEventListener(kind, letGo);
    removeEventListener("hashchange", letGo);
  };
  // Held each time the page shows (the shell keeps it, and coming back puts it where it was left; the link names this card): until you touch or
  // scroll it, or leave it.
  const arm = () => {
    if (!focus) return;
    held = true;
    keep.observe(page);
    keep.observe(body);
    for (const kind of ["pointerdown", "wheel", "keydown"]) page.addEventListener(kind, letGo, { once: true, passive: true });
    addEventListener("hashchange", letGo, { once: true });
    requestAnimationFrame(hold);
  };
  arm();
  // What the page shows comes from these: coming back with none of them changed, nothing is drawn again (the pile settles again, that's all).
  let notesIn = 0;
  let listsIn = 0;
  let listsShown = -1; // the lists the cards after the pile were last worked out with
  let contentIn = 0;
  const stampOf = (now) => [evidenceVersion(), contentIn, notesIn, listsIn, dayOf(now), bankWords(lang).length, lang].join("|");
  let stamp = "";
  // The cards in their places, in order: each comes in as it's made, one at a time, so the page's frame and its first card are there at once.
  const NAMES = ["words", "week", "ideas", "everyday", "time", "credit"];
  // The shell keeps a new page unseen until `ready` (400 ms at most), then puts it where `place` says in its first frame: so whatever the first
  // screen shows is there in it, at its final height, and nothing comes into it after. Opened at a card (a link), every card: the pile is
  // off the screen, so nothing of it waits on them. Opened at its top, down to This week, the card under the pile on the first screen; the
  // rest come in below it, off the screen, after the pile.
  const upTo = focus ? NAMES.length - 1 : NAMES.indexOf("week");
  let composed;
  const ready = new Promise((resolve) => (composed = resolve));
  const composing = () => Boolean(composed);
  const isComposed = (name) => {
    if (composed && NAMES.indexOf(name) >= upTo) {
      composed();
      composed = null;
    }
  };
  // Those are worked out at once (the page is unseen meanwhile), never after the pile.
  const eager = (name) => composing() && NAMES.indexOf(name) <= upTo;
  let slots = null;
  let wordsOf = "";
  let drawing = 0;
  const put = (name, node) => {
    const old = slots[name];
    const next = node ?? document.createComment(name);
    if (old !== next) old.replaceWith(next);
    slots[name] = next;
  };
  // The way forward, when something's slipping, over the cards: known before the first frame (a read of the word index, stopping at the first
  // slipping one), so nothing moves the pile when the sums come.
  let slippingShown = null;
  const showSlipping = (on) => {
    if (on === slippingShown) return;
    slippingShown = on;
    fill(top, on ? wideButton("Review what's slipping", { variant: "go", size: "lg", onclick: () => (location.hash = "#study/session/slipping?from=know") }) : null);
  };
  const anySlipping = (now) =>
    wordEntries({ lang, kinds: /^[wpc]:/ }).some((entry) => {
      const s = stateOf(entry.unit, { lang, now });
      return Boolean(s && !s.isNew && s.slipping);
    });
  // only: the cards that depend on what changed (the word list: Everyday and its credit; the notes: the ideas); the rest stay as they are, so
  // a card that's arriving keeps arriving.
  //
  // Your words comes first and at once (its words are read from the evidence's index, with no replay), and nothing else holds up its frames:
  // This week and the ideas are worked out a little at a time once the pile is moving (slices.js), each card put in its place when it's ready;
  // the sums (knowledge), Everyday and Over time, which can't yet be had a piece at a time, once the pile is at rest.
  const draw = async ({ quiet = false, only = null } = {}) => {
    // A whole draw takes over from any before it; a partial one never stops a whole one that's still placing its cards.
    const run = only ? drawing : ++drawing;
    const alive = () => run === drawing && Boolean(slots);
    // Marked on the board once a whole draw has put every card (checks wait for it).
    if (!only) delete body.dataset.drawn;
    const now = Date.now();
    stamp = stampOf(now);
    // A new account's way to start.
    const startButton = () => wideButton("Start your first session", { variant: "go", size: "lg", onclick: () => (location.hash = "#study/session/day?from=know") });
    const rows = startedWords({ lang, now });
    if (!rows.length && !KIND_ORDER.some((kind) => knowledge({ lang, now, said: said(lang) }).kinds[kind].started)) {
      if (only) return;
      fill(
        top,
        ui.emptyState(
          [
            el("p", {}, "Nothing to show yet. Study a little, and it starts here."),
            startButton(),
          ],
          { pose: "page" },
        ),
      );
      slippingShown = null;
      fill(body);
      slots = null;
      wordsOf = "";
      isComposed("credit");
      return;
    }
    if (!slots) {
      if (only) return;
      slots = Object.fromEntries(NAMES.map((name) => [name, document.createComment(name)]));
      body.replaceChildren(...Object.values(slots));
    }
    if (!only) showSlipping(anySlipping(now));
    // Your words: kept as it is unless the words started changed (which ones you know well it works out itself).
    const ids = rows.map((row) => row.unit).join(" ");
    if ((!only || only.includes("words")) && (ids !== wordsOf || slots.words.nodeType !== Node.ELEMENT_NODE)) {
      put("words", wordsCard({ lang, rows }));
      wordsOf = ids;
    }
    if (!only) isComposed("words");
    if (held) requestAnimationFrame(hold);
    const pile = slots.words;
    if (!eager("week")) await Promise.race([pileMoving(pile), wait(400)]);
    for (const [name, steps] of [
      ["week", () => more.weekCardSteps({ lang, now })],
      ["ideas", () => more.ideasCardSteps({ lang, now })],
    ]) {
      if (!alive()) return;
      if (only && !only.includes(name)) continue;
      const make = eager(name) ? whole(steps()) : await inSlices(steps(), { alive });
      if (!make || !alive()) return;
      put(name, quiet ? more.quietly(make) : make());
      if (!only) isComposed(name);
      if (held) hold();
    }
    const rest = ["everyday", "time", "credit"].filter((name) => !only || only.includes(name));
    if (only && !rest.length) return;
    const lists = listsIn;
    // Opened at Everyday or below it: the word list first (it's this device's own after the first time), so Everyday is drawn as it stays.
    if (eager("everyday")) await Promise.race([loadFrequency(lang).catch(() => {}), wait(250)]);
    else {
      await Promise.race([pileFree(pile), wait(4000)]);
      await turn();
    }
    if (!alive()) return;
    // The word list arriving draws Everyday again, unless a whole draw has drawn it with the list since.
    if (only && listsShown >= lists) return;
    listsShown = listsIn;
    const k = knowledge({ lang, now, said: said(lang) });
    if (!only) showSlipping(k.slipping.length > 0);
    const learnNext = () => wideButton(t("know.map.learnNext"), { variant: "gray", onclick: () => (location.hash = "#study/session/frequent?from=know") });
    const makers = {
      everyday: () => more.everydayCard({ lang, now, k, said: said(lang), action: learnNext() }),
      time: () => more.timeCard({ lang, now, k }),
      credit: () => (k.everyday ? creditRow(lang) : null),
    };
    for (const name of rest) {
      if (!eager(name)) await turn();
      if (!alive()) return;
      put(name, quiet ? more.quietly(makers[name]) : makers[name]());
      if (!only) isComposed(name);
      if (held) hold();
    }
    if (!only) body.dataset.drawn = "";
  };
  draw();
  // The ideas' pictures light the words the packs' notes mark: once the notes are read, the page is brought up to date. Read once the pile
  // is at rest (reading them is a long task on a slow phone, and nothing on the screen needs them while it moves).
  Promise.race([pileFree(slots?.words), wait(4000)])
    .then(() => notesReady([...new Set(ITEMS.map((item) => item.pack))]))
    .then(() => {
      notesIn++;
      if (slots) draw({ quiet: true, only: ["ideas"] });
    })
    .catch(() => {});
  // The word list arrives in the background (it's fetched once, then cached).
  loadFrequency(lang);
  const stop = onFrequency((which) => {
    if (which !== lang) return;
    listsIn++;
    draw({ quiet: true, only: ["everyday", "credit"] });
  });
  const offContent = onContentChange(() => contentIn++);
  // Coming back (the shell keeps it): the same page at once. Only when something it shows has changed is it brought up to date, quietly,
  // card by card; the pile settles again either way.
  return {
    title: asTab ? "Knowledge" : "What you know",
    back: asTab ? undefined : { href: "#today", label: "Home" },
    ready,
    // Where the page shows first: at the card a link opened it at.
    place: focus ? hold : undefined,
    dispose: () => {
      stop();
      offContent();
      keep?.disconnect();
    },
    refresh: () => {
      // The pile's way in first, so a draw that follows waits for this one.
      if (slots?.words?.nodeType === Node.ELEMENT_NODE) settleAgain(slots.words);
      if (stampOf(Date.now()) !== stamp) draw({ quiet: true });
      arm();
    },
  };
}

// What's worth knowing now, each with a way to act.
function rightNowPage(page) {
  const lang = learning();
  const now = Date.now();
  const { items } = highlights(knowledge({ lang, now, said: said(lang) }), lang, now);
  fill(page, ui.pageTitle("Right now"), items.length ? el("div", { class: "lx-know-highlights" }, items) : ui.emptyState("Nothing to point out right now.", { pose: "lounge" }));
  return { title: "Right now", back: BACK };
}

// One cell's list: the kind's units you know by that strength, the ones you're still learning by it, and a session on
// the gap.
function listPage(page, kind, skill) {
  if (!KIND_TITLE[kind] || !SKILLS.includes(skill)) return knowledgePage(page, { asTab: false });
  const now = Date.now();
  const row = (unit) => {
    const s = unitState(unit, { now });
    const strength = s.strengths[skill];
    const info = describe(unit);
    const recall = strength ? `${Math.round(strength.recall * 100)}% likely now` : `not tested by ${SKILL_LABEL[skill].toLowerCase()}ing yet`;
    return ui.listRow({ title: ui.wordLabel(shownName(unit)), sub: [info.en, recall].filter(Boolean).join(" · "), href: conceptHref(unit), trailing: ui.strengthMeter(strength?.level ?? 0, strength?.due && strength.level >= 2 ? "slipping" : undefined) });
  };
  const known = unitsBy({ now, kind, skill });
  const learning = unitsBy({ now, kind, skill, started: true });
  const gap = planSession("gap", `${kind}/${skill}`);
  const kindName = KIND_TITLE[kind].toLowerCase();
  fill(page,
    ui.pageTitle(capital(`${kindName} you can ${VERB[skill]}`), `${known.length} so far.`),
    gap.steps.length ? wideButton(gap.title, { variant: "go", size: "lg", onclick: () => (location.hash = `#study/session/gap/${kind}/${skill}?from=know`) }) : null,
    known.length ? el("ul", { part: "list" }, known.map(row)) : el("p", { class: "lx-muted" }, "None yet."),
    learning.length ? el("section", { part: "section" }, el("h2", { part: "section-title" }, `Still learning (${learning.length})`), el("ul", { part: "list" }, learning.map(row))) : null,
  );
  return { title: KIND_TITLE[kind], back: { href: "#know/skills", label: "Read, hear, say" } };
}

// A stretch of the most common words (#know/words/<start>): each word, where it ranks, and how well you know it.
function wordsPage(page, start) {
  const lang = learning();
  const from = Math.max(0, Number(start) || 0);
  const strip = wordStrip({ lang, now: Date.now(), size: from + 100, said: said(lang) });
  if (!strip) {
    page.replaceChildren(el("p", { class: "lx-muted" }, "The list of common words isn't here yet. It comes from the open library when you're online."));
    loadFrequency(lang).then((list) => list && wordsPage(page, start));
    return { title: "Common words", back: { href: "#know/common", label: "Common words" } };
  }
  const STATE = { known: "You'd read it", said: "In your word bank", learning: "Learning", slipping: "Slipping", new: "Not studied yet" };
  const cells = strip.cells.slice(from, from + 100);
  fill(
    page,
    ui.pageTitle(`Words ${(from + 1).toLocaleString()} to ${(from + cells.length).toLocaleString()}`),
    el(
      "ul",
      { part: "list" },
      cells.map((c) => {
        const unit = `w:${c.lemma}`;
        const info = describe(unit);
        const read = c.state === "new" || c.state === "said" ? null : unitState(unit, { lang }).strengths.read;
        return ui.listRow({
          title: [`${c.rank.toLocaleString()}. `, ui.wordLabel(shownName(unit))],
          sub: [info.en, STATE[c.state]].filter(Boolean).join(" · "),
          href: conceptHref(unit),
          trailing: read ? ui.strengthMeter(read.level, c.state === "slipping" ? "slipping" : undefined) : undefined,
        });
      }),
    ),
    creditRow(lang),
  );
  return { title: "Common words", back: { href: "#know/common", label: "Common words" } };
}

// The Knowledge page's own pages, by address (a concept's address always has its kind's prefix, "w:" and the like).
const PAGES = { now: rightNowPage };

// The cards a link can open the page at: #know/<name>. (Home's things done this week is #know/days; the older pages and cards these took over
// open them too.)
const CARD_OF = { days: "week", week: "week", everyday: "everyday", map: "everyday", common: "everyday", ideas: "ideas", grammar: "ideas", time: "time", growth: "time", skills: "time" };

/** Renders the Knowledge page, one of its pages, a list, or a concept's page. asTab: Knowledge has the fourth tab (no back link). */
export function renderKnow(page, rest, { asTab = false } = {}) {
  if (rest[0] === "list") return listPage(page, rest[1], rest[2]);
  if (rest[0] === "words" && rest[1] === "week") return renderYourWords(page, { at: "week0" });
  if (rest[0] === "week" && rest.length === 1) return renderWeek(page);
  if (rest[0] === "ideas" && rest.length === 1) return renderIdeas(page);
  if (rest[0] === "words" && rest[1] !== undefined) return wordsPage(page, rest[1]);
  if (rest[0] === "words") return renderYourWords(page);
  if (rest[0] === "everyday" && rest[1] === "words") return renderEveryday(page);
  if (rest[0] === "time" && rest[1] === "more") return renderTime(page);
  if (Object.hasOwn(CARD_OF, rest[0]) && rest.length === 1) return knowledgePage(page, { asTab, focus: CARD_OF[rest[0]] });
  if (Object.hasOwn(PAGES, rest[0])) return PAGES[rest[0]](page);
  if (rest[0]) return renderConcept(page, rest[0]);
  return knowledgePage(page, { asTab });
}

