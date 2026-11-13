// Practice with your AI, the section: its own tab (#practise[/…]) or, when Know has that tab, in Study
// (#study/practice[/…]), and from Today. Every page here links within the address it was opened at:
//   (home)          the kinds of practice, your AI, a practice that's open, past practices on this device
//   new/<kind>      how you'll answer, how long, a topic; Start opens the room
//   room[/<id>]     the live room (room.js) over the home page; without an id, the practice that's open
//   past/<id>       a finished practice: how it went, and its whole transcript
// Opening any of these sends what you know for your AI (learner.js) and collects finished practices onto this device.
// A practice starts in the language you're learning; a past one in another language says which.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { api, keptMe, post, whoAmI } from "../shell/api.js";
import { keySummary, ownKeyPresent } from "../ai/own-key.js";
import { HOSTED_NAME, hostedReady } from "../ai/hosted.js";
import { learning, learningFrom, learningLocale, learningName } from "../study/learning.js";
import { LANGUAGES, isOwnLanguage, languageName } from "../lang/index.js";
import { ANSWERS, KINDS, MINUTES } from "./protocol.js";
import * as P from "./ui.js";
import { learnerSnapshot, sendLearner } from "./learner.js";
import { collectFinished, deletePractice, getPractice, languageOf, listPractices, tally } from "./store.js";
import { openRoom, practicePrefs, setPracticePrefs } from "./room.js";
import { createTranscript, summaryBlock } from "./transcript.js";
import { sampleOn } from "../study/sample-mode.js";
import { copyButton, twoStepRow } from "../shell/settings.js";

// Each kind's quiet symbol (lx/symbols.js), drawn on its own with no well, as the AI page's rows are.
const KIND_SYMBOL = { conversation: "theme-talk", roleplay: "theme-people", translate: "translate-q", story: "theme-stories", games: "games-q", why: "hint-q" };

// Where the section was opened: base, its address; back, the link over its home page (none when it's a tab).
const IN_STUDY = { base: "#study/practice", back: { href: "#study", label: "Study" } };
const toPractice = (nav) => ({ href: nav.base, label: "Practice" });

const when = (ms) => {
  const days = Math.floor((Date.now() - ms) / 86400_000);
  const time = new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return days <= 0 ? `Today, ${time}` : days === 1 ? `Yesterday, ${time}` : new Date(ms).toLocaleDateString([], { day: "numeric", month: "short" });
};

function pastRow(practice, nav) {
  const counts = tally(practice);
  const turns = practice.turns.filter((t) => t.who === "you" && t.type !== "hint").length;
  const other = languageOf(practice) !== learning() ? languageName(languageOf(practice)) : null;
  const bits = [other, `${turns} ${turns === 1 ? "answer" : "answers"}`, counts.right && `${counts.right} right`, counts.fixed + counts.wrong && `${counts.fixed + counts.wrong} to work on`].filter(Boolean);
  return ui.listRow({
    symbol: KIND_SYMBOL[practice.settings?.kind] ?? "theme-talk",
    title: `${KINDS[practice.settings?.kind]?.name ?? "Practice"}${practice.mode === "ai" ? " in your AI" : ""}`,
    sub: `${when(practice.createdAt)} · ${bits.join(" · ")}`,
    href: `${nav.base}/past/${encodeURIComponent(practice.id)}`,
  });
}

function home(page, nav) {
  const open = el("div", { class: "lx-practice-open" });
  const past = el("ul", { part: "list" });
  const connected = el("p", { class: "lx-small lx-muted" }, "Checking your AI…");
  const hereText = `Practice ${learningName()} with me here`;

  const kinds = Object.entries(KINDS).map(([id, kind]) => ui.listRow({ symbol: KIND_SYMBOL[id] ?? "theme-talk", title: kind.name, href: `${nav.base}/new/${id}` }));
  page.replaceChildren(
    ui.pageTitle("Practice with your AI"),
    open,
    el("section", { part: "section" }, el("h2", { part: "section-title" }, "Start a practice"), el("ul", { part: "list" }, kinds)),
    el(
      "section",
      { part: "section" },
      el("h2", { part: "section-title" }, "In your AI's own app"),
      el("p", { class: "lx-muted" }, "Talk with your AI where it is (typing, or the Claude app's voice mode); it logs the practice and its grades here. Tell it:"),
      // What to say, as a line with its Copy: no box around it.
      el("ul", { part: "list" }, el("li", { class: "lx-row-item" }, el("div", { part: "list-row" }, el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title", lang: "en" }, hereText)), copyButton(() => hereText)))),
      connected,
    ),
    el("section", { part: "section" }, el("h2", { part: "section-title" }, "Past practices"), past),
  );

  // Drawn again only when there's something new (collecting finished practices usually finds nothing): the same list stays
  // as it was, with the Tinta already on it.
  let pastShown = null;
  const drawPast = async () => {
    const all = await listPractices();
    const finished = all.filter((p) => p.state === "ended" || p.endedAt);
    const shown = JSON.stringify(finished.slice(0, 30).map((p) => [p.id, p.endedAt, p.turns?.length]));
    if (shown === pastShown) return;
    pastShown = shown;
    past.replaceChildren(...(finished.length ? finished.slice(0, 30).map((p) => pastRow(p, nav)) : [ui.emptyState("Practices you finish are kept here, on this device.", { pose: "page", tag: "li" })]));
  };
  const drawOpen = (list) => {
    const live = list.find((p) => p.state !== "ended" && (p.mode === "app" || p.mode === "inapp"));
    const logged = list.find((p) => p.state !== "ended" && p.mode === "ai");
    const rows = [];
    if (live) {
      const who = live.mode === "app" && live.ai.phase === "absent" ? "waiting for your AI" : `with ${live.client}`;
      rows.push(ui.listRow({ icon: "chat", title: `${KINDS[live.settings.kind]?.name ?? "Practice"} is open`, sub: `Started ${when(live.createdAt).toLowerCase()}, ${who}`, href: `${nav.base}/room/${encodeURIComponent(live.id)}`, trailing: ui.badge("new", "Back to it") }));
    }
    if (logged) rows.push(ui.listRow({ icon: "chat", title: `${logged.client ?? "Your AI"} is logging a practice`, sub: "Follow along as it goes", href: `${nav.base}/room/${encodeURIComponent(logged.id)}` }));
    open.replaceChildren(...(rows.length ? [el("ul", { part: "list" }, rows)] : []));
  };

  let alive = true;
  drawPast();
  sendLearner();
  collectFinished()
    .then(({ open: list }) => alive && (drawOpen(list), drawPast()))
    .catch(() => {});
  api("/api/connections")
    .then((apps) => {
      if (!alive) return;
      connected.replaceChildren(
        apps.length ? `Connected: ${[...new Set(apps.map((a) => a.app))].join(", ")}. ` : "No AI is connected yet. ",
        el("a", { href: "#ai/connect", class: "lx-link" }, apps.length ? "Connection" : "Connect one"),
      );
    })
    .catch(() => connected.replaceChildren());
  return { title: "Practice", back: nav.back, dispose: () => (alive = false) };
}

function setup(page, kindId, nav) {
  const kind = KINDS[kindId];
  if (!kind) return home(page, nav);
  const prefs = practicePrefs();
  // A language of your own with no real tag (und-x-…): nothing on any device listens for it, so you type, and the row says so rather than
  // offering a microphone that can't hear it. A real code (Burmese's) keeps the choice: the room's microphone says why if this device can't.
  const typesOnly = !learningLocale();
  const choice = { answer: typesOnly ? "type" : prefs.answer, minutes: prefs.minutes };
  const topic = el("input", { part: "text-field", type: "text", maxlength: "80", placeholder: kindId === "roleplay" ? "A scene: dinner with family, the bakery…" : "Anything", "aria-label": "Topic", autocomplete: "off" });
  const error = el("p", { class: "lx-small", role: "alert" });
  // Who runs it: the in-app AI with a key of yours on this device (ai/own-key.js), the in-app AI on the plan (ai/hosted.js), or
  // your AI app over MCP. The choice is drawn at once from what this device knows (who you are, as last seen; whether it holds a
  // key), so nothing moves when the reads come back: only the key's model name fills in, in the same row.
  const kept = keptMe();
  const engine = { choice: "app", key: null, keyHere: Boolean(kept?.features?.ownKey) && ownKeyPresent(), plan: hostedReady(kept) };
  engine.choice = engine.keyHere ? "here" : engine.plan ? "plan" : "app";
  const who = el("div");
  const tellYourAi = el("p", { class: "lx-small lx-muted" }, `Then tell your AI to practice ${learningName()} with you in Lexicommons. It joins as soon as you start, whichever of you is first.`);
  const drawWho = () => {
    tellYourAi.hidden = engine.choice !== "app";
    const options = [];
    if (engine.keyHere) options.push(["here", engine.key?.model.name ?? "Your key"]);
    if (engine.plan) options.push(["plan", HOSTED_NAME]);
    if (!options.length) return who.replaceChildren();
    options.push(["app", "Your AI app"]);
    who.replaceChildren(
      ui.group(null, [
        ui.choiceRow({
          icon: "chat",
          title: "Who you'll practice with",
          options,
          value: engine.choice,
          onchange: (v) => {
            engine.choice = v;
            tellYourAi.hidden = v !== "app";
          },
        }),
      ]),
    );
  };
  drawWho();
  whoAmI()
    .then(async (me) => {
      const key = me?.features?.ownKey ? await keySummary(me.user.id).catch(() => null) : null;
      if (!page.isConnected) return;
      const changed = Boolean(key) !== engine.keyHere || hostedReady(me) !== engine.plan || key?.model.name !== engine.key?.model.name;
      engine.key = key;
      engine.keyHere = Boolean(key);
      engine.plan = hostedReady(me);
      if ((engine.choice === "here" && !engine.keyHere) || (engine.choice === "plan" && !engine.plan)) engine.choice = engine.keyHere ? "here" : engine.plan ? "plan" : "app";
      if (changed) drawWho();
    })
    .catch(() => {});
  let starting = false;
  const start = ui.button("Start", {
    variant: "go",
    size: "lg",
    block: true,
    onclick: async () => {
      if (starting) return;
      starting = true;
      error.textContent = "";
      setPracticePrefs(choice);
      try {
        // A practice is yours, with your AI: the sample learner's never reaches it (study/sample-mode.js).
        if (sampleOn()) throw new Error("Turn the sample learner off first: a practice with your AI is your own.");
        let inapp = {};
        if (engine.choice === "plan") inapp = { inapp: { engine: "plan", name: HOSTED_NAME } };
        else if (engine.choice === "here") {
          const key = engine.key ?? (await keySummary((await whoAmI()).user.id));
          if (!key) throw new Error("There's no key on this device for this account any more. Add it again in the AI section.");
          inapp = { inapp: { engine: "own-key", name: key.model.name } };
        }
        const practice = await post("/api/practice", { kind: kindId, answer: choice.answer, minutes: choice.minutes, topic: topic.value.trim() || undefined, language: learning(), ...(isOwnLanguage(learning()) ? { languageDef: LANGUAGES[learning()].def } : {}), from: learningFrom(), snapshot: learnerSnapshot(), ...inapp });
        location.hash = `${nav.base}/room/${encodeURIComponent(practice.id)}`;
      } catch (e) {
        error.textContent = e.message;
      } finally {
        starting = false;
      }
    },
  });
  topic.addEventListener("keydown", (event) => event.key === "Enter" && start.click());
  page.replaceChildren(
    ui.pageTitle(kind.name, kind.about),
    who,
    ui.group(null, [
      typesOnly
        ? ui.listRow({ icon: "pencil", title: "How you'll answer", value: ANSWERS.type, sub: `Nothing listens for ${learningName()}: it's a language of your own.` })
        : ui.choiceRow({ icon: "mic", title: "How you'll answer", options: Object.entries(ANSWERS), value: choice.answer, onchange: (v) => (choice.answer = v) }),
      ui.choiceRow({ icon: "clock", title: "How many minutes", options: MINUTES.map((m) => [m, String(m)]), value: choice.minutes, onchange: (v) => (choice.minutes = v) }),
    ]),
    el("label", { part: "field" }, el("span", { class: "lx-small lx-muted" }, kindId === "roleplay" ? "The scene (optional)" : "A topic (optional)"), topic),
    start,
    error,
    tellYourAi,
  );
  return { title: kind.name, back: toPractice(nav) };
}

function room(page, id, app, nav) {
  const view = home(page, nav);
  let current = null;
  const show = (practiceId) => {
    current = openRoom(app, practiceId, { onClose: () => (location.hash = nav.base), base: nav.base });
  };
  if (id) show(id);
  else {
    api("/api/practice")
      .then((list) => {
        const open = list.find((p) => p.state !== "ended" && (p.mode === "app" || p.mode === "inapp")) ?? list.find((p) => p.state !== "ended");
        if (open) show(open.id);
        else location.hash = nav.base;
      })
      .catch(() => (location.hash = nav.base));
  }
  return {
    ...view,
    dispose: () => {
      view.dispose?.();
      current?.close();
    },
  };
}

function pastPage(page, id, nav) {
  page.replaceChildren(ui.loadingState());
  let alive = true;
  getPractice(id).then((practice) => {
    if (!alive) return;
    if (!practice) return page.replaceChildren(ui.emptyState("That practice isn't on this device.", { pose: "shrug" }));
    const transcript = createTranscript({ practiceId: id, client: practice.client ?? "Your AI", appear: false, language: languageOf(practice) });
    transcript.apply(practice.turns);
    transcript.closeCards();
    const kind = KINDS[practice.settings?.kind];
    // Plain until pressed: the first press asks again, in the warning's color (Settings' rows: twoStepRow).
    const remove = twoStepRow({
      icon: "trash",
      title: "Delete this practice",
      confirm: "Press again to delete it",
      action: async () => {
        await deletePractice(id);
        location.hash = nav.base;
      },
    });
    page.replaceChildren(
      ui.pageTitle(kind?.name ?? "Practice", `${when(practice.createdAt)} · ${languageName(languageOf(practice))}${practice.client ? ` · with ${practice.client}` : ""}`),
      summaryBlock(practice),
      // Its lines as a script, never boxed (the room's own lines keep their bubbles).
      el("section", { part: "section", class: "lx-practice-past" }, el("h2", { part: "section-title" }, "The practice"), transcript.node),
      ui.group(null, [remove]),
    );
  });
  return { title: "Practice", back: toPractice(nav), dispose: () => (alive = false) };
}

/**
 * Renders the section into `page` (app: the app's root, where the room opens; base: the address it's opened at,
 * "#practice" in the AI tab; back: where its own page goes back to, the AI tab). Returns { title, back, dispose }.
 */
export function renderPractice(page, rest, app = document.querySelector('[data-part="app"]'), { base = IN_STUDY.base, back } = {}) {
  const nav = base === IN_STUDY.base ? IN_STUDY : { base, back };
  if (rest[0] === "new") return setup(page, rest[1], nav);
  if (rest[0] === "room") return room(page, rest[1], app, nav);
  if (rest[0] === "past" && rest[1]) return pastPage(page, rest[1], nav);
  return home(page, nav);
}
