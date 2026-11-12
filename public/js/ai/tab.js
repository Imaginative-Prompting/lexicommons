// The AI section (#ai): optional, a tab only once an AI is connected, and otherwise one calm page and a row in Settings.
// Lexicommons runs no AI of its own; yours checks in over MCP, picks up what you asked for (a practice, sentences for a pack,
// a new pack, a new look, an answer) and its work lands in the app. The page: who your AI is and when it was last here; a
// session to start (Practice's own pages, #practice/…, under this section); what you can ask for, each kind a page of its own
// (#ai/new/<kind>) with Send to your AI pinned low; your requests, live, each with where it is (and Cancel while it waits);
// an answered question's page (#ai/request/<id>); past sessions; the connection (#ai/connect, connection.js); the switch for
// the "…" outside the section (ask.js); and a question to send at once, low on the screen. The data is ai/client.js's.

import { sentencesOf } from "../study/pack-items.js";
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { REQUEST_KINDS, answerParts, cancelRequest, createRequest, describeRequest, requestLinks, requestStatus, watchRequests } from "./client.js";
import { aiConnected, setAiConnected, thirdTab } from "../shell/layout.js";
import { connectionPage } from "./connection.js";
import { keptMe, whoAmI } from "../shell/api.js";
import { HOSTED_NAME, hostedReady } from "./hosted.js";
import { ANSWERS, KINDS as PRACTICE_KINDS, MINUTES } from "../practice/protocol.js";
import { yourPacks } from "../study/packs.js";
import { learning, learningName } from "../study/learning.js";
import { LANGUAGES, languageName } from "../lang/index.js";
import { languageRow as pickLanguageRow, wheelOrder } from "../translate/picker.js";
import { ITEMS, conceptsOf, onContentChange, sentence } from "../study/content.js";
import { unitState } from "../study/progress.js";
import { AI_APPS, aiMark } from "./marks.js";
import { WEAVE_LANGUAGES } from "../read/weave-languages.generated.js";

const BACK = { href: "#ai", label: "AI" };
// Each kind's tile: its icon and a line under its name (the names are requests.js's).
const KIND_TILE = {
  practice: { icon: "chat", sub: "Talk, role-play or games, live here" },
  text_new: { icon: "book", sub: "A story at your level, an article, a book" },
  pack_add: { icon: "cards", sub: "More sentences, aimed at what's due" },
  pack_new: { icon: "sparkle", sub: "For a trip, a job, a book" },
  look: { icon: "palette", sub: "A new theme, or this one changed" },
  ask: { icon: "info", sub: "Grammar, a word, anything" },
};
// What you can ask your AI for, as rows on the AI page (Practice is the page's card; a free question isn't one: you'd type it here, go to
// your AI's app, then come back for the answer): each kind's quiet symbol, no well, and its page.
const ASKABLE = ["text_new", "pack_add", "pack_new", "look"];
// How your AI picks a request up, and where what it makes shows: said on each kind's page, so you know where to look once it's done.
const PICKUP = "It waits for your AI: in its own app, start a new chat, or ask it to check your Lexicommons requests. You can cancel it until then.";
const LANDS = {
  pack_new: "It comes on your path after the unit you're in, under its own name, and Study → Study a topic has it at once.",
  pack_add: "Its new words come in that pack's lessons, on your path and in Study → Study a topic.",
  text_new: "It comes in Read, among your texts.",
  look: "Your app changes as soon as it's done, and Undo puts it back.",
  ask: "Its answer comes here, under Your requests.",
};
const KIND_SYMBOL = { text_new: "reading-q", pack_add: "cards-q", pack_new: "deck-q", look: "palette-q", ask: "hint-q", practice: "theme-talk", weave: "translate-q" };
// Where each link a finished request carries goes.
const LINK_HREF = { text: (id) => `#read/book/${encodeURIComponent(id)}`, pack: (id) => `#settings/study/packs/${encodeURIComponent(id)}`, theme: (id) => `#settings/appearance/themes/${encodeURIComponent(id)}`, practice: (id) => `#practice/past/${encodeURIComponent(id)}` };

const ago = (at) => {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
};

function message() {
  const node = el("p", { class: "lx-settings-message", role: "status" });
  node.say = (text, tone) => {
    node.replaceChildren(text ?? "");
    if (tone) node.setAttribute("data-tone", tone);
    else node.removeAttribute("data-tone");
  };
  return node;
}

/** A request as a row: where it is, and the way on (an answer's page, what it made, or Cancel while it waits). */
function requestRowOf(request, msg, { cancelable = true } = {}) {
  const { mark, text } = requestStatus(request);
  const links = requestLinks(request);
  const answered = request.kind === "ask" && request.result?.answer;
  const href = answered || request.kind === "ask" ? `#ai/request/${encodeURIComponent(request.id)}` : links[0] ? LINK_HREF[links[0].kind]?.(links[0].id) : undefined;
  const cancel =
    cancelable && mark === "waiting"
      ? ui.button("Cancel", {
          size: "sm",
          onclick: async () => {
            try {
              await cancelRequest(request.id);
              msg.say("Canceled: no AI will take it.");
            } catch (error) {
              msg.say(error.message, "wrong");
            }
          },
        })
      : null;
  return ui.requestRow({ state: mark, symbol: KIND_SYMBOL[request.kind], icon: KIND_TILE[request.kind]?.icon ?? "chat", title: describeRequest(request), status: text, href, action: cancel });
}

const quiet = (label, ...content) => el("details", { class: "lx-quiet-more" }, el("summary", {}, label), el("div", { class: "lx-quiet-body" }, ...content));

/**
 * Pairs of short sentences this learner knows (four words at most, every word and idea of them met), for Practice's drawn conversation, so
 * the card speaks their own Dutch; else the language's first short ones. Today's pair first, then the next ones (practiceCard takes the
 * first whose bubbles each fit on one line).
 */
function practicePairs(maxWords = 4) {
  const short = ITEMS.filter((item) => item.words?.length && item.words.length <= maxWords && item.means);
  const met = short.filter((item) => conceptsOf(item).every((unit) => !unitState(unit).isNew));
  const from = met.length >= 2 ? met : short;
  if (from.length < 2) return [];
  const day = Math.floor(Date.now() / 86_400_000);
  const line = (item) => ({ text: sentence(item), means: item.means });
  const daily = Array.from({ length: Math.min(from.length, 60) }, (_, k) => [line(from[(day + k) % from.length]), line(from[(day + k + 1) % from.length])]);
  // Then the shortest, for a narrow phone where few fit.
  const shortest = [...from].sort((a, b) => sentence(a).length - sentence(b).length).slice(0, 6).map(line);
  return [...daily, ...shortest.slice(0, -1).map((one, k) => [one, shortest[k + 1]])];
}

/** Practice with me: the AI page's one card. A conversation drawn in hard light (Tinta on its floor, your AI's line over yours, in
 * sentences you know), what it is in a line, and Start. */
function practiceCard({ client }) {
  const lang = learning();
  const language = languageName(lang);
  const tinta = ui.character({ state: "beside", size: 44, hidden: true, pokeable: true });
  tinta.classList.add("lx-hc-perch");
  const scene = el("span", { class: "lx-hc-scene lx-ap-scene", "aria-hidden": "true" });
  // Small, so each line has a row of its own: your AI's at the left, yours at the right, Tinta on the floor under them.
  const put = ([ai, you]) =>
    scene.replaceChildren(
      el("span", { class: "lx-hc-bubble", "data-who": "ai" }, el("span", { class: "lx-hc-words", lang }, ai.text)),
      el("span", { class: "lx-hc-bubble", "data-who": "you" }, el("span", { class: "lx-hc-words", lang }, you.text)),
      el("span", { class: "lx-hc-floor" }, tinta),
    );
  // Each bubble on one line, never a sentence broken: the first pair (from today's) that fits the scene as it's laid out now. Its text's
  // line boxes, counted by a Range (the words' own box is one box however many lines it has).
  const lines = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set([...range.getClientRects()].filter((r) => r.width).map((r) => Math.round(r.top))).size;
  };
  const oneLine = () => [...scene.querySelectorAll(".lx-hc-words")].every((words) => lines(words) === 1);
  // When no pair of yours fits beside the title, each on one line (a language with only its starter, whose shortest sentences run four
  // words or more; a narrow phone), the conversation goes across the card over the title, where sentences of up to six words fit.
  let width = 0;
  const fits = (pairs) => pairs.some((pair) => (put(pair), oneLine()));
  // Fitted: its pair picked at the card's laid-out width (the page's ready waits for it, so the first frame seen has the pair that fits: made
  // before it's on the page, it puts the first pair as is, and after a restart that one, two lines a bubble, showed for a frame before the
  // pair that fits took its place and moved all below it 32 px: lex-design-2's first-draw-check, 7 Nov).
  let fitted = null;
  const fit = new Promise((resolve) => (fitted = resolve));
  const draw = () => {
    const card = scene.closest('[data-part="ai-practice"]');
    const side = practicePairs(4);
    const across = practicePairs(6);
    if (!side.length && !across.length) return (fitted(), put([{ text: "…" }, { text: "…" }]));
    card?.removeAttribute("data-fit");
    width = card?.clientWidth ?? 0;
    // Not laid out yet: the first pair for now, and the observer comes back once it is.
    if (!width) return put(side[0] ?? across[0]);
    fitted();
    if (side.length && fits(side)) return;
    card.setAttribute("data-fit", "across");
    if (fits(across)) return;
    put(across[0] ?? side[0]);
  };
  draw();
  // The study material changed: picked again at once while the card isn't on the screen (the page kept away, or still composing unseen), else
  // the next time it comes (lxStale, lxRedraw).
  let stale = false;
  const seen = () => scene.isConnected && !scene.closest("[data-waiting]");
  const stopContent = onContentChange(() => {
    if (seen()) stale = true;
    else draw();
  });
  // Laid out later, or at another width (a phone turned): picked again. The card's own width, so the layout changing inside it never asks again.
  const resized = new ResizeObserver(() => {
    const card = scene.closest('[data-part="ai-practice"]');
    if (card?.clientWidth && card.clientWidth !== width) draw();
  });
  const sub = el("p", { class: "lx-ap-sub" });
  const says = (who) => sub.replaceChildren(`Chat, role-play and games in ${language}, with ${who || "your AI"}`);
  says(client);
  const card = el(
    "section",
    { part: "ai-practice" },
    el(
      "div",
      { class: "lx-ap-top" },
      scene,
      el("div", { class: "lx-ap-text" }, el("h2", { class: "lx-ap-title" }, "Practice with me"), sub),
    ),
    ui.button("Start", { variant: "go", size: "lg", block: true, onclick: () => (location.hash = "#practice") }),
  );
  resized.observe(card);
  card.lxTinta = tinta;
  card.lxClient = says;
  card.lxStale = () => stale;
  card.lxFitted = fit;
  card.lxRedraw = () => {
    if (!stale) return;
    stale = false;
    draw();
  };
  card.lxStop = () => (stopContent(), resized.disconnect());
  return card;
}

function home(page) {
  const msg = message();
  // Practice with me, the one card: its Tinta scribbles while your AI works on a request, and catches the result when one is done
  // while you're here (or since you were).
  const practice = practiceCard({ client: keptMe()?.aiClient ?? null });
  const tinta = practice.lxTinta;
  let statesWere = null;
  // At the foot, quiet: your requests (a page of their own) and the connection, with when your AI was last here as its value.
  const requestsRow = ui.listRow({ icon: "clock", title: "Your requests", value: "", href: "#ai/requests" });
  const connectionRow = ui.listRow({ icon: "plug", title: "Connection", value: "", href: "#ai/connect" });
  const valueOf = (row) => row.querySelector(".lx-row-value");
  // On a computer (1280 px and up) the page is two columns (settings-wide.css): beside Practice and what to ask for, an aside holds the
  // connection (which AI, when it was last here) and your newest requests, the ones your AI hasn't finished first. It's built there
  // only: narrower, the page is as it always was, with Your requests and Connection as rows at its foot.
  const body = el("div", { class: "lx-stack lx-ai-body lx-ai-home" });
  const wide = globalThis.matchMedia?.("(min-width: 1280px)");
  const ASIDE_ROWS = 3;
  let aside = null;
  let latest = null;
  const markOf = (who) => (/claude/i.test(who ?? "") ? aiMark("claude", 28) : /codex|openai|chatgpt|gpt/i.test(who ?? "") ? aiMark("openai", 28) : icon("plug"));
  function drawAside() {
    if (!aside || !latest) return;
    const { requests, ai } = latest;
    const who = ai?.client ?? keptMe()?.aiClient ?? null;
    aside.lxMark.replaceChildren(markOf(who));
    aside.lxWho.textContent = who ?? "Your AI";
    aside.lxWhen.textContent = ai ? ago(ai.at) : "";
    aside.lxWhen.hidden = !ai;
    // The ones still to do first (waiting, then being worked on, as they came), then the newest finished.
    const open = requests.filter((r) => r.state === "waiting" || r.state === "taken");
    const shown = [...open, ...requests.filter((r) => !open.includes(r))].slice(0, ASIDE_ROWS);
    aside.lxList.replaceChildren(...shown.map((request) => requestRowOf(request, msg, { cancelable: false })));
    aside.lxList.hidden = !shown.length;
    aside.lxNone.hidden = shown.length > 0;
  }
  function placeAside() {
    if (wide?.matches && !aside) {
      const lxMark = el("span", { class: "lx-ai-aside-mark", "aria-hidden": "true" });
      const lxWho = el("span", { class: "lx-ai-aside-who" });
      const lxWhen = el("span", { class: "lx-ai-aside-when" });
      const lxList = el("ul", { class: "lx-requests" });
      const lxNone = el("p", { class: "lx-ai-aside-none" }, "Nothing asked yet. What you ask your AI for shows here, with where it is.");
      aside = el(
        "aside",
        { class: "lx-ai-aside" },
        el("a", { class: "lx-ai-aside-card", href: "#ai/connect" }, lxMark, el("span", { class: "lx-ai-aside-text" }, el("span", { class: "lx-ai-aside-label" }, "Connection"), lxWho, lxWhen), icon("chevron")),
        el("section", { class: "lx-ai-aside-requests" }, ui.sectionHead("Your requests", { link: { href: "#ai/requests" } }), lxList, lxNone),
      );
      Object.assign(aside, { lxMark, lxWho, lxWhen, lxList, lxNone });
      body.append(aside);
      drawAside();
    } else if (!wide?.matches && aside) {
      aside.remove();
      aside = null;
    }
  }
  wide?.addEventListener?.("change", placeAside);
  body.append(
    practice,
    ui.group("Ask your AI for something", [
      ...ASKABLE.filter((kind) => REQUEST_KINDS[kind]).map((kind) => ui.listRow({ symbol: KIND_SYMBOL[kind], title: REQUEST_KINDS[kind].name, sub: KIND_TILE[kind]?.sub ?? REQUEST_KINDS[kind].about, href: `#ai/new/${kind}` })),
      // Weaving is asked from the text itself, in Read (reader.js offerWeave), and only into a language it's ready for: said here so it's found.
      ...(WEAVE_LANGUAGES.includes(learning()) ? [ui.listRow({ symbol: KIND_SYMBOL.weave, title: "Weave a text", sub: `English that turns ${learningName()} as you learn. Start in Read`, href: "#read" })] : []),
    ]),
    ui.group("", [ui.listRow({ icon: "chat", title: "Past practices", href: "#practice" }), requestsRow, connectionRow]),
  );
  placeAside();
  page.replaceChildren(...(sectionBack() ? [ui.pageTitle("AI")] : []), body, msg);
  // Your requests, followed live while the page is on the screen. The shell keeps the page while you're elsewhere: it stops following
  // then (hide), and takes it up again when you're back (refresh).
  let stop = () => {};
  let drawn;
  const ready = new Promise((resolve) => (drawn = resolve));
  const follow = () => {
    stop();
    stop = watchRequests(({ requests, ai }) => {
      const who = ai?.client ?? keptMe()?.aiClient ?? null;
      valueOf(connectionRow).textContent = ai ? `${who ?? "Your AI"} · ${ago(ai.at)}` : "";
      valueOf(requestsRow).textContent = requests.length ? String(requests.length) : "";
      practice.lxClient(who);
      latest = { requests, ai };
      drawAside();
      const states = new Map(requests.map((r) => [r.id, r.state]));
      const arrived = statesWere && requests.some((r) => r.state === "done" && statesWere.has(r.id) && statesWere.get(r.id) !== "done");
      statesWere = states;
      ui.holdCharacter(tinta, requests.some((r) => r.state === "taken") ? "scribble" : "beside");
      if (arrived) ui.playCharacter(tinta, "catch");
      drawn();
    });
  };
  follow();
  // Shown whole once its first answer is drawn (shell/main.js reveal).
  // Coming back after the study material changed (practice.lxStale): the card picked again before the first frame.
  const refresh = ({ now = false } = {}) => {
    if (now) practice.lxRedraw();
    follow();
  };
  return { title: "AI", back: sectionBack(), ready: Promise.all([ready, practice.lxFitted]), dispose: () => (stop(), practice.lxStop(), wide?.removeEventListener?.("change", placeAside)), hide: () => stop(), refresh, stale: () => practice.lxStale() };
}

/** Your requests, every one, newest first (#ai/requests): where each is, and its way on (an answer, what it made, Cancel while it waits). */
function requestsPage(page) {
  const msg = message();
  const list = el("ul", { class: "lx-requests" });
  const empty = ui.emptyState("Nothing asked yet. What you ask your AI for shows here, with where it is.", { pose: "page" });
  page.replaceChildren(ui.pageTitle("Your requests"), el("div", { class: "lx-stack lx-ai-body" }, list, empty), msg);
  let stop = () => {};
  const follow = () => {
    stop();
    stop = watchRequests(({ requests }) => {
      empty.hidden = requests.length > 0;
      list.replaceChildren(...requests.map((request) => requestRowOf(request, msg)));
    });
  };
  follow();
  return { title: "Your requests", back: BACK, dispose: () => stop(), hide: () => stop(), refresh: follow };
}

// With a tab of its own the section is a tab's page; with none it's a row in Settings, and goes back there.
const sectionBack = () => (thirdTab() === "ai" ? undefined : aiConnected() ? { href: "#today", label: "Home" } : { href: "#settings", label: "Settings" });

/**
 * The section with no AI connected: what it is, that it's optional, and the one thing to press. Nothing here waits for
 * an AI that isn't there. Connecting happens elsewhere (the AI's own app), so it asks again as it opens.
 */
function notConnected(page) {
  const tinta = ui.character({ state: "beside", size: 56, hidden: true, pokeable: true });
  // On the plan (ai/hosted.js), its in-app AI is here already, and Practice on it is this page's one thing to press; connecting an
  // AI app comes after, as the other way. Without the plan the page is as it always was. Drawn from who you are as this device
  // last saw it, and again if the fresh answer says otherwise (just back from buying the plan, say).
  const body = el("div", { class: "lx-stack lx-ai-body" });
  const what = (text) => quiet("What it can do", el("p", { class: "lx-small lx-muted" }, text));
  const draw = (plan) =>
    body.replaceChildren(
      ...(plan
        ? [
            ui.aiStatus({
              connected: true,
              who: HOSTED_NAME,
              note: "Included in your plan: Practice, every kind, and Translate with AI, right here.",
              character: tinta,
              action: ui.button("Practice", { variant: "go", block: true, onclick: () => (location.hash = "#practice") }),
            }),
            el("ul", { part: "list" }, ui.listRow({ icon: "plug", title: "Or connect an AI app you already use", sub: "Claude, Codex or another, free", href: "#ai/connect" })),
            what(
              `${HOSTED_NAME} comes with your plan: Practice, every kind, and Translate with AI, right here. An AI you connect can do more: ask it about what you're learning in its own app, have it make packs or add to yours, write you a story at your level, or change how the app looks, on your own account.`,
            ),
          ]
        : [
            // Never connected: one card to connect for the first time, and each app that works as a row with its own mark.
            el(
              "section",
              { part: "ai-practice", "data-variant": "connect" },
              el("div", { class: "lx-ai-marks", "aria-hidden": "true" }, aiMark("claude", 40), aiMark("openai", 40)),
              el("div", { class: "lx-ap-text" }, el("h2", { class: "lx-ap-title" }, "Connect your AI"), el("p", { class: "lx-ap-sub" }, `Practice in ${learningName()} with Claude or Codex, right here, and ask it about what you're learning in its own app. Optional: everything else works without it.`)),
              ui.button("Connect your AI", { variant: "go", size: "lg", block: true, onclick: () => (location.hash = "#ai/connect") }),
            ),
            ui.group("Works with", AI_APPS.map((app) => ui.listRow({ art: aiMark(app.mark, 28), title: app.name, sub: app.sub, href: app.href }))),
          ]),
    );
  let plan = hostedReady(keptMe());
  draw(plan);
  page.replaceChildren(ui.pageTitle("AI"), body);
  whoAmI()
    .then((me) => {
      setAiConnected(me.aiConnected);
      if (hostedReady(me) !== plan && page.isConnected) draw((plan = hostedReady(me)));
    })
    .catch(() => {});
  return { title: "AI", back: sectionBack() };
}

/** A page to write one request on: its fields, and Send to your AI pinned low. */
function requestPage(page, kind) {
  const def = REQUEST_KINDS[kind];
  const msg = message();
  const field = (attrs) => el("textarea", { part: "text-field", rows: 3, maxlength: 600, ...attrs });
  let build = () => ({ kind });
  const body = [];
  let sendable = true;
  let wheelRow = null; // a language's row: its wheel goes when the page does
  if (kind === "practice") {
    let picked = "conversation";
    let answer = "both";
    let minutes = 10;
    // The kinds by name, and what the one picked is under them: six explanations at once were a wall to read.
    const kinds = ui.group(
      "What kind",
      Object.entries(PRACTICE_KINDS).map(([id, k]) =>
        ui.radioRow({
          title: k.name,
          name: "practice-kind",
          value: id,
          checked: id === picked,
          onchange: () => {
            picked = id;
            kinds.querySelector('[data-part="group-note"]').textContent = k.about;
          },
        }),
      ),
      PRACTICE_KINDS[picked].about,
    );
    const topic = el("input", { part: "text-field", type: "text", maxlength: 120, placeholder: "About what (optional): at the bakery, your weekend…", "aria-label": "About what" });
    body.push(
      kinds,
      el("section", { class: "lx-stack" }, el("h2", { part: "group-label" }, "About"), topic),
      el("section", { class: "lx-stack" }, el("h2", { part: "group-label" }, "How you'll answer"), ui.segmented(Object.entries(ANSWERS), answer, (value) => (answer = value), "How you'll answer")),
      el("section", { class: "lx-stack" }, el("h2", { part: "group-label" }, "How many minutes"), ui.segmented(MINUTES.map((m) => [m, String(m)]), minutes, (value) => (minutes = value), "How many minutes")),
      el("p", { class: "lx-small lx-muted" }, "It opens here as soon as your AI joins. ", el("a", { href: "#practice" }, "Or start one now"), "."),
    );
    build = () => ({ kind, practice: { kind: picked, answer, minutes, ...(topic.value.trim() ? { topic: topic.value.trim() } : {}) } });
  } else if (kind === "pack_add") {
    const packs = yourPacks();
    let pack = packs[0]?.pack ?? null;
    const what = field({ placeholder: "What to add: 20 sentences for the train station, say", "aria-label": "What to add" });
    let due = true;
    if (!packs.length) {
      // Nothing to add to yet: the way forward is to make one.
      sendable = false;
      body.push(
        ui.emptyState("You have no pack of your own yet. Ask your AI to make one first.", { pose: "box" }),
        ui.button("Make a new pack", { variant: "go", size: "lg", block: true, onclick: () => (location.hash = "#ai/new/pack_new") }),
      );
    } else {
      body.push(
        ui.group("Which pack", packs.map((r, i) => ui.radioRow({ title: r.pack.name, sub: `Yours · ${sentencesOf(r.pack).length} sentences`, name: "pack", value: r.pack.id, checked: i === 0, onchange: () => (pack = r.pack) }))),
        el("section", { class: "lx-stack" }, el("h2", { part: "group-label" }, "What to add"), what),
        el("ul", { part: "list" }, ui.switchRow({ icon: "target", title: "Aim at what's due", sub: "Use the words and patterns you're reviewing now", checked: due, onchange: (on) => (due = on) })),
      );
    }
    build = () => ({ kind, pack: pack?.id, packName: pack?.name, what: what.value.trim(), due });
  } else if (kind === "pack_new" || kind === "text_new") {
    let language = learning();
    const what = field(kind === "text_new" ? { placeholder: "What to add: a short story about a market, at A2, say; or the EPUB in your Downloads", "aria-label": "What to add" } : { placeholder: "What it's for: a trip to Berlin in May, say", "aria-label": "What it's for" });
    const languages = Object.keys(LANGUAGES).filter((code) => code !== "en");
    body.push(
      el("section", { class: "lx-stack" }, el("h2", { part: "group-label" }, kind === "text_new" ? "What to add" : "What it's for"), what),
      ui.group(null, [(wheelRow = pickLanguageRow({ title: "In which language", codes: wheelOrder([learning()], languages, languageName), current: language, nameOf: languageName, onchange: (code) => (language = code) }))]),
    );
    build = () => ({ kind, what: what.value.trim(), language });
  } else if (kind === "look") {
    const what = field({ placeholder: "How it should look: warm and quiet, like an old library, say", "aria-label": "How it should look" });
    let fresh = false;
    body.push(el("section", { class: "lx-stack" }, el("h2", { part: "group-label" }, "How it should look"), what), el("ul", { part: "list" }, ui.switchRow({ icon: "palette", title: "Start fresh", sub: "A new theme, rather than this one changed", checked: fresh, onchange: (on) => (fresh = on) })));
    build = () => ({ kind, what: what.value.trim(), fresh });
  } else {
    // A question, and any kind added later: what you'd like, in your words.
    const what = field({ rows: 5, maxlength: 2000, placeholder: kind === "ask" ? "Your question: why does the verb go to the end here?" : "What you'd like", "aria-label": kind === "ask" ? "Your question" : "What you'd like" });
    body.push(el("section", { class: "lx-stack" }, el("h2", { part: "group-label" }, kind === "ask" ? "Your question" : "What you'd like"), what));
    build = () => ({ kind, what: what.value.trim(), ...(kind === "ask" ? { about: { where: "ai" } } : {}) });
  }
  const send = ui.button("Send to your AI", {
    variant: "go",
    size: "lg",
    block: true,
    onclick: async () => {
      try {
        await createRequest(build());
        location.hash = "#ai";
      } catch (error) {
        msg.say(error.message, "wrong");
      }
    },
  });
  const lands = LANDS[kind] ? [el("p", { class: "lx-small lx-muted" }, LANDS[kind])] : [];
  page.replaceChildren(el("div", { class: "lx-stack lx-ai-form" }, ui.pageTitle(def.name, def.about), ...body, ...(sendable ? lands : [])), msg, ...(sendable ? [ui.pinnedActions([send], { note: PICKUP })] : []));
  return { title: def.name, back: BACK, dispose: () => wheelRow?.lxClose() };
}

/** A question you asked, and its answer when it's come (the language's words marked, put in as text). */
function requestDetail(page, id) {
  const body = el("div", { class: "lx-stack" }, ui.loadingState());
  page.replaceChildren(body);
  const stop = watchRequests(({ requests }) => {
    const request = requests.find((r) => r.id === id);
    if (!request) return body.replaceChildren(ui.emptyState("That request isn't here any more.", { pose: "shrug" }));
    const { text } = requestStatus(request);
    const lang = request.about?.language ?? learning();
    const answer = request.result?.answer;
    body.replaceChildren(
      ...[
        ui.pageTitle(REQUEST_KINDS[request.kind]?.name ?? "Your request", text),
        el("p", { class: "lx-ai-asked" }, request.what ?? describeRequest(request)),
        answer
          ? el(
              "section",
              { class: "lx-ai-answer", "aria-label": "The answer" },
              answer.split(/\n{2,}/).map((paragraph) => el("p", {}, answerParts(paragraph).map((part) => (part.language ? el("span", { lang, class: "lx-ai-said" }, part.text) : part.text)))),
            )
          : null,
        ...requestLinks(request).map((link) => ui.listRow({ icon: { pack: "cards", theme: "palette", text: "book" }[link.kind] ?? "chat", title: link.label, href: LINK_HREF[link.kind]?.(link.id) })),
      ].filter(Boolean),
    );
  });
  return { title: "AI", back: BACK, dispose: stop };
}

/** Renders the AI tab's pages into `page`. Returns { title, back?, dispose? }. */
export function renderAi(page, rest = []) {
  // A request left earlier keeps its page. Anything that would wait for an AI needs one connected.
  if (rest[0] === "request" && rest[1]) return requestDetail(page, rest[1]);
  if (rest[0] === "connect") return { ...connectionPage(page), back: BACK };
  if (!aiConnected()) return notConnected(page);
  if (rest[0] === "new" && Object.hasOwn(REQUEST_KINDS, rest[1] ?? "") && !REQUEST_KINDS[rest[1]].from) return requestPage(page, rest[1]);
  if (rest[0] === "requests") return requestsPage(page);
  return home(page);
}
