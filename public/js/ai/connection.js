// The AI section's Connection page (#ai/connect): how to connect an AI, the apps connected, personal tokens and what your AI
// has sent; and, where this site offers it, a key of your own for the in-app AI (ownKeyGroup: ai/own-key.js). It's the only
// place connecting is offered. #settings/ai, its old address, opens it (shell/main.js).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { api, post, whoAmI } from "../shell/api.js";
import { languageName } from "../lang/index.js";
import { setAiConnected } from "../shell/layout.js";
import { learnerView } from "../shell/sharing.js";
import { bytes, copyButton, emptyRow, labelled, message, when } from "../shell/settings.js";
import { connectOpenRouter, forgetKey, keyStanding, keySummary, onKeyChange, savePastedKey, usageThisMonth } from "./own-key.js";
import { aiMark } from "./marks.js";

// For an AI app's own instructions, so a plain question about the language finds your study without being told where to look (coach-check tries it for real).
const COACH_LINE = "I'm learning a language in Lexicommons. When I ask about a language, or what I'm bad at, or why a word goes where it does, read my study there first and answer from my own sentences and mistakes.";

const dollars = (n) => (Number.isInteger(Number(n)) ? `$${Number(n)}` : `$${Number(n).toFixed(2)}`);

/**
 * A key of your own for the in-app AI: Connect with OpenRouter (nothing to copy), or a key pasted in; then what's shown of it
 * (never the key), its limit as OpenRouter says, this device's use this month, and Forget. The key stays on this device.
 */
function ownKeyGroup(me, msg) {
  const body = el("div", { class: "lx-stack" });
  const draw = async () => {
    const key = await keySummary(me.user.id);
    if (!key) {
      // type=password: never shown, and never written into the page as an attribute, so no rule in a look can read it.
      const field = el("input", { part: "text-field", type: "password", autocomplete: "off", spellcheck: "false", placeholder: "sk-or-…", "aria-label": "Your OpenRouter key" });
      const pasted = el("form", { class: "lx-inline-form" }, field, ui.button("Save", { type: "submit" }));
      pasted.addEventListener("submit", async (event) => {
        event.preventDefault();
        const value = field.value;
        field.value = "";
        try {
          await savePastedKey(me.user.id, { provider: "openrouter", key: value });
          msg.say("Saved on this device. Practice can run right here now.", "right");
        } catch (error) {
          msg.say(error.message, "wrong");
        }
      });
      body.replaceChildren(
        el("p", { class: "lx-small lx-muted" }, "Practice and Ask why can run right here, on your own OpenRouter account: you pay OpenRouter for what you use. Your key stays on this device. Lexicommons never sees it."),
        // Not the page's one solid: the page is for connecting your own AI (its address); a key of your own is the other way.
        ui.button("Connect with OpenRouter", { variant: "gray", block: true, onclick: () => connectOpenRouter().catch((error) => msg.say(error.message, "wrong")) }),
        el("details", { class: "lx-quiet-more" }, el("summary", {}, "Or paste a key"), el("div", { class: "lx-quiet-body" }, pasted, el("p", { part: "group-note" }, "Make it a key with a spending limit (OpenRouter → Keys)."))),
      );
      return;
    }
    const standing = el("p", { class: "lx-small lx-muted" }, "Checking it with OpenRouter…");
    const used = usageThisMonth();
    const shown = [
      el("ul", { part: "list" }, ui.listRow({ icon: "key", title: `${key.providerName} · ends ${key.last4}`, sub: `On this device, with ${key.model.name}`, trailing: el("span") }), ui.listRow({ icon: "chat", title: "Start a practice", sub: "Talk, role-play or games, right here", href: "#practice" })),
      standing,
    ];
    if (used.calls) shown.push(el("p", { class: "lx-small lx-muted" }, `This month on this device: ${used.calls} ${used.calls === 1 ? "answer" : "answers"}, ${dollars(used.cost)} as OpenRouter counted it.`));
    shown.push(ui.button("Forget this key", { variant: "danger", size: "sm", icon: "trash", onclick: async () => (await forgetKey(me.user.id), msg.say("Forgotten on this device.", "right")) }));
    body.replaceChildren(...shown);
    keyStanding(me.user.id)
      .then((info) => {
        if (!info) return;
        standing.textContent =
          info.limit === null
            ? "This key has no spending limit. You can set one in OpenRouter's key settings."
            : `Spending limit ${dollars(info.limit)}, ${dollars(info.remaining ?? 0)} left.`;
      })
      .catch((error) => (standing.textContent = error.message));
  };
  const stop = onKeyChange(() => (body.isConnected ? draw() : stop()));
  draw();
  return labelled("Your own key", body);
}

const MCP_URL = `${location.origin}/mcp`;

/** A connection made or let go here: the tab bar and the AI section follow (shell/main.js). */
const askConnected = () => whoAmI().then((me) => setAiConnected(me.aiConnected)).catch(() => {});

export function connectionPage(page) {
  // Named, so the page's reading text keeps the measure on a computer wherever it opens: in Settings or in the AI section (settings-wide.css).
  page.classList.add("lx-ai-connection");
  const msg = message();
  const connections = el("ul", { part: "list" });
  const tokens = el("ul", { part: "list" });
  const sent = el("ul", { part: "list" });
  const newToken = el("div", { class: "lx-stack", hidden: true });

  const loadConnections = async () => {
    const list = await api("/api/connections");
    connections.replaceChildren(
      ...(list.length
        ? list.map((c) =>
            ui.listRow({
              icon: "plug",
              title: c.app,
              sub: `Connected ${when(c.createdAt)}`,
              trailing: ui.button("Disconnect", {
                variant: "fade",
                size: "sm",
                onclick: async () => {
                  await api(`/api/connections/${encodeURIComponent(c.id)}`, { method: "DELETE" });
                  askConnected();
                  loadConnections();
                },
              }),
            }),
          )
        : [emptyRow("No apps connected yet.")]),
    );
  };
  const loadTokens = async () => {
    const list = await api("/api/tokens");
    tokens.replaceChildren(
      ...(list.length
        ? list.map((t) =>
            ui.listRow({
              icon: "key",
              title: t.name,
              sub: `${t.prefix}… · ${t.admin ? "admin access · " : ""}created ${when(t.createdAt)} · last used ${when(t.lastUsedAt)}`,
              trailing: ui.button("Revoke", {
                variant: "fade",
                size: "sm",
                onclick: async () => {
                  await api(`/api/tokens/${encodeURIComponent(t.id)}`, { method: "DELETE" });
                  askConnected();
                  loadTokens();
                },
              }),
            }),
          )
        : [emptyRow("No tokens.")]),
    );
  };
  // Your study, as your AI can read it (study-record.js): what's up there, and when it goes.
  const reading = el("ul", { part: "list" });
  const loadReading = async () => {
    const { records } = await api("/api/ai/record");
    reading.replaceChildren(
      ...(records.length
        ? records.map((r) => ui.listRow({ icon: "book", title: languageName(r.language), sub: `Your lessons, how each thing is going and the sentences you missed. Sent ${when(r.updatedAt)}` }))
        : [emptyRow("Nothing yet. It's sent from this app after you study, while an AI is connected.")]),
    );
  };

  const loadSent = async () => {
    const [notes, uploads] = await Promise.all([api("/api/notes"), api("/api/uploads")]);
    const items = [
      ...notes.map((n) => ui.listRow({ icon: "chat", title: n.text, sub: `${n.source} · ${when(n.createdAt)}` })),
      ...uploads.map((u) => {
        const row = ui.listRow({ icon: u.contentType?.startsWith("audio/") ? "speaker" : "upload", title: u.filename, sub: `${u.status} · ${bytes(u.size)} · ${u.source} · ${when(u.createdAt)}` });
        if (u.status === "stored" && u.contentType?.startsWith("audio/")) row.append(el("audio", { controls: true, preload: "none", src: `/api/uploads/${u.id}/file` }));
        return row;
      }),
    ];
    sent.replaceChildren(...(items.length ? items : [emptyRow("Nothing yet. Ask your connected AI to save a note.")]));
  };

  const tokenName = el("input", { part: "text-field", name: "name", placeholder: "Token name, e.g. my script", maxlength: 60, required: true, "aria-label": "New personal token's name" });
  const tokenForm = el("form", { class: "lx-inline-form" }, tokenName, ui.button("Create token", { type: "submit" }));
  // Only an admin's or a moderator's account is offered admin access: a token that reaches that role's tools (for their
  // own scripts, or the monitoring agent).
  const adminAccess = ui.switchRow({ icon: "key", title: "Admin access", sub: "This token can use your role's tools (the open library, or moderation). Only for your own scripts; leave it off for anything else." });
  const adminSwitch = adminAccess.querySelector("input");
  const adminList = el("ul", { part: "list", hidden: true }, adminAccess);
  api("/api/me")
    .then((me) => (adminList.hidden = !me.roles?.some((role) => role === "admin" || role === "moderator") || learnerView()))
    .catch(() => {});
  tokenForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const { token } = await post("/api/tokens", { name: tokenName.value, ...(adminList.hidden ? {} : { admin: adminSwitch.checked }) });
      askConnected();
      newToken.replaceChildren(el("p", { class: "lx-small" }, "Copy it now. It won't be shown again."), el("div", { class: "lx-inline-form" }, el("code", { class: "lx-code lx-secret" }, token), copyButton(() => token)));
      newToken.hidden = false;
      tokenForm.reset();
      adminSwitch.checked = false;
      loadTokens();
    } catch (error) {
      msg.say(error.message, "wrong");
    }
  });

  // Each app's instructions open in place.
  // Each app by its own mark (ai/marks.js); anything else by the plug.
  const howTo = (mark, title, ...body) =>
    el(
      "li",
      { class: "lx-row-item" },
      el(
        "details",
        { class: "lx-disclosure" },
        el("summary", { part: "list-row" }, el("span", { class: "lx-row-icon", "data-art": "" }, mark === "plug" ? icon("plug") : aiMark(mark, 28)), el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, title)), icon("chevron")),
        el("div", { class: "lx-disclosure-body" }, ...body),
      ),
    );
  const command = (text) => el("div", { class: "lx-inline-form" }, el("code", { class: "lx-code" }, text), copyButton(() => text));

  Promise.all([loadConnections(), loadTokens(), loadSent(), loadReading()]).catch((error) => msg.say(error.message, "wrong"));
  // Where this site offers it: a key of your own for the in-app AI (its group takes its place once whoAmI says so).
  const ownKey = el("div");
  whoAmI()
    .then((me) => {
      if (me?.features?.ownKey && page.isConnected) ownKey.replaceChildren(ownKeyGroup(me, msg));
      const flash = sessionStorage.getItem("lx.own-key.flash");
      if (flash) {
        sessionStorage.removeItem("lx.own-key.flash");
        msg.say(flash, "right");
      }
    })
    .catch(() => {});
  const quiet = (label, ...content) => el("details", { class: "lx-quiet-more" }, el("summary", {}, label), el("div", { class: "lx-quiet-body" }, ...content));
  page.replaceChildren(
    ui.pageTitle("Your AI"),
    // The page's one solid: copying the address, where connecting any AI starts.
    labelled("MCP address", (() => {
      const row = command(MCP_URL);
      row.querySelector('[data-part="button"]')?.setAttribute("data-variant", "go");
      return row;
    })()),
    ui.group("How to connect", [
      howTo("claude", "Claude Code", command(`claude mcp add --transport http lexicommons ${MCP_URL}`), el("p", { class: "lx-small lx-muted" }, "Then type /mcp in Claude Code and choose Authenticate.")),
      howTo("claude", "The Claude app (web, desktop, phone)", el("p", { class: "lx-small lx-muted" }, "Settings → Connectors → Add custom connector, and paste the MCP address. Add it on the web or desktop; it then works in the phone app too.")),
      howTo("openai", "Codex", command(`codex mcp add lexicommons --url ${MCP_URL} && codex mcp login lexicommons`), el("p", { class: "lx-small lx-muted" }, "Or in the Codex app: Settings → MCP servers → add the address.")),
      howTo("plug", "Anything else", el("p", { class: "lx-small lx-muted" }, "Apps with MCP sign-in just need the address. Apps without it can send a personal token (below) as Authorization: Bearer … to the same address, or call the REST API at /api/v1/.")),
    ]),
    ownKey,
    labelled("Connected apps", connections),
    quiet("Personal tokens", tokenForm, adminList, newToken, tokens, el("p", { part: "group-note" }, "For scripts and apps without MCP sign-in. A token acts as you; revoke it any time.")),
    quiet(
      "Talk about what you're learning",
      el("p", { class: "lx-small lx-muted" }, "Your AI can read your lessons and what you're struggling with. So in your AI's own app, ask: why a verb goes where it does, what the difference is between two words, what you're bad at, what to work on next. It answers from your own sentences and mistakes."),
      el("p", { class: "lx-small lx-muted" }, "Or ask it to make something, right there: \"make me a Lexicommons pack for my trip to Utrecht\", \"add this article to my Lexicommons reading\", \"give my Lexicommons app autumn colors\". What it makes comes into your app on its own."),
      el("p", { class: "lx-small lx-muted" }, "Say \"in Lexicommons\" the first time, so it knows where to look. Or give your AI this line once, in its own instructions or memory:"),
      el("div", { class: "lx-inline-form" }, el("code", { class: "lx-code" }, COACH_LINE), copyButton(() => COACH_LINE)),
    ),
    quiet("What your AI can read", reading, el("p", { part: "group-note" }, "So it can coach you from your own study. It's a copy, replaced each time, and it goes when you disconnect your last AI. With none connected, none of this leaves your device.")),
    quiet("What your AI has sent", sent),
    msg,
  );
  return { title: "Your AI" };
}
