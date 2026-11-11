// /design: the AI tab's parts (lx/ui.js: aiStatus, requestKinds, requestRow), in every state, with sample requests;
// and asking your AI about something from where you are (ai/ask.js): the "…" and its menu, the sheet's about card,
// and the line that says what happened. The tab fills the same builders from your requests (ai/client.js).

import * as ui from "./lx/ui.js";

const KINDS = [
  { icon: "chat", title: "Practice with me", sub: "Talk, role-play or games, live here", href: "#design-ai" },
  { icon: "book", title: "Add a text", sub: "A story at your level, an article, a book", href: "#design-ai" },
  { icon: "cards", title: "Add to my pack", sub: "More sentences, aimed at what's due", href: "#design-ai" },
  { icon: "sparkle", title: "Make a new pack", sub: "For a trip, a job, a book", href: "#design-ai" },
  { icon: "palette", title: "Change my look", sub: "A new theme, or this one changed", href: "#design-ai" },
  { icon: "info", title: "Ask a question", sub: "Grammar, a word, anything", href: "#design-ai" },
];

export function aiSection({ section, demo, states }) {
  const row = (state, icon, title, status, action) => ui.requestRow({ state, icon, title, status, href: action ? undefined : "#design-ai", action });
  return section(
    "ai",
    "The AI tab",
    "Your AI and the requests you leave it: who checked in last, what you can ask for, and where each request is. A request's state is an icon and words; the colors only follow them.",
    states("Your AI", [
      ["connected: Tinta beside it, listening", ui.aiStatus({ connected: true, who: "Claude", when: "2 min ago", note: "Send your AI a request. It picks it up the next time you talk to it, or at once if it's waiting.", character: ui.character({ state: "beside", size: 56, hidden: true }) })],
      ["working on a request: Tinta scribbling", ui.aiStatus({ connected: true, who: "Claude", when: "just now", note: "Send your AI a request. It picks it up the next time you talk to it, or at once if it's waiting.", character: ui.character({ state: "scribble", size: 56, hidden: true }) })],
      ["not yet", ui.aiStatus({ connected: false, note: "Connect your AI once, then send it requests from here.", action: ui.button("Connect your AI", { variant: "white", icon: "plug" }), character: ui.character({ state: "beside", size: 56, hidden: true }) })],
    ]),
    demo("What you can ask for: each kind opens its page", ui.requestKinds(KINDS)),
    demo(
      "Your requests, in every state",
      ui.el(
        "ul",
        { class: "lx-requests" },
        row("waiting", "cards", "Add to my pack: Mijn Nederlands · 20 sentences for the train", "Waiting for your AI · sent 5 min ago", ui.button("Cancel", { size: "sm" })),
        row("working", "sparkle", "Make a new pack: a trip to Berlin in May", "Claude is on it"),
        row("done", "info", "Ask a question: why does the verb go to the end?", "Done Oct 27 · Read the answer"),
        row("failed", "palette", "Change my look: like an old library", "Couldn't: that font isn't one it can use"),
        row("canceled", "chat", "Practice with me: Role-play", "Canceled Oct 26"),
      ),
    ),
    demo(
      "Ask about this: the … by a sentence, a word or a pattern opens its menu (press it)",
      ui.el(
        "div",
        { class: "ds-ask-row" },
        ui.el("p", { lang: "nl" }, "Ik heb gisteren een boek gelezen."),
        ui.moreMenu({ label: "More about this sentence", items: ASK_ITEMS }),
      ),
    ),
    demo("The menu, open", ui.menu({ label: "More about this sentence", items: ASK_ITEMS })),
    demo("What a question is about, in the sheet you write it in", ui.askAbout({ text: "Ik heb gisteren een boek gelezen.", lang: "nl", meta: "Choose · your answer was right" })),
    states("What happened to it", [
      ["sent", said("right", "Sent to your AI. The answer comes back on the AI tab.", ui.button("Undo", { variant: "fade", size: "sm" }))],
      ["copied", said("right", "Copied. Paste it into any AI.")],
      ["canceled", said(null, "Canceled: no AI will take it.")],
      ["couldn't", said("wrong", "Couldn't reach Lexicommons, so it wasn't sent. Try again when you're online.")],
    ]),
  );
}

const ASK_ITEMS = [
  { icon: "sparkle", title: "Explain this", sub: "Your AI explains this sentence and why it goes this way" },
  { icon: "chat", title: "Ask your AI about this…", sub: "Write your own question" },
  { icon: "copy", title: "Copy the question", sub: "To paste into any AI" },
];

function said(meaning, text, action) {
  const line = ui.askStatus();
  line.say(meaning, text, action);
  return line;
}
