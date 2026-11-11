// Add your own pack (Explore, #explore/own?lang): for everyone, on Explore's home where Share and Ask for it sit once sharing is open. Its
// ways to a pack of your own: an Anki deck (the import page), one started by hand (an empty pack of yours, then its editor, where you add
// words and sentences one at a time), and, only with an AI connected, the words to ask your AI to make one with Lexicommons' tools
// (get_pack_guide, create_pack), on what you say and at a level you pick, with Copy. Nothing here is shared: a pack of yours stays yours.
// With no AI, nothing on the page names one.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t } from "../lx/i18n.js";
import { languageName, LANGUAGES } from "../lang/index.js";
import { fromFor, learning, learningFrom } from "../study/learning.js";
import { aiConnected } from "../shell/layout.js";
import * as packs from "../study/packs.js";
import { newPack, packIdFor } from "../study/pack-authoring.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const NAME_LIMIT = 80;
const ABOUT_LIMIT = 120;

export const ownHref = (lang) => `#explore/own?${new URLSearchParams({ lang })}`;

/** Explore's home row to this page. */
export const ownRow = (lang) => ui.listRow({ icon: "plus", title: t("explore.own.row"), href: ownHref(lang) });

export function renderOwn(page, params = {}) {
  const lang = params.lang && LANGUAGES[params.lang] && params.lang !== "en" ? params.lang : learning();
  const anki = ui.group(null, [ui.listRow({ symbol: "deck-q", title: t("explore.own.anki"), sub: t("explore.own.ankiSub"), href: `#study/import?${new URLSearchParams({ from: "own", lang })}` })]);
  page.replaceChildren(ui.pageTitle(t("explore.own.title"), t("explore.own.sub", { language: languageName(lang) })), anki, byHand(lang), ...(aiConnected() ? [withYourAi(lang)] : []));
  return { title: "Explore", back: { href: `#explore?lang=${lang}`, label: "Explore" } };
}

/** Start one by hand, right on the page: its name, then Start makes an empty pack of yours and opens it to add words and sentences to. */
function byHand(lang) {
  const name = el("input", { part: "text-field", maxlength: NAME_LIMIT, placeholder: t("explore.own.nameHint"), "aria-label": t("explore.own.name"), autocapitalize: "sentences", enterkeyhint: "go" });
  const status = el("p", { class: "lx-small", role: "status" });
  const start = ui.button(t("explore.own.start"), { variant: "go", size: "lg", block: true });
  let starting = false;
  const go = async () => {
    if (starting) return;
    const words = name.value.trim();
    if (words.length < 2) return void (status.textContent = t("explore.own.nameShort"));
    starting = true;
    const taken = new Set([...packs.allPacks().map((one) => one.id), ...packs.yourPacks().map((one) => one.id)]);
    const from = lang === learning() ? learningFrom() : fromFor(lang, null);
    const saved = await packs.savePack(newPack({ id: packIdFor(words, taken), name: words, language: lang, from }), { by: "you" });
    starting = false;
    if (!saved.ok) return void (status.textContent = saved.errors?.[0]?.message ?? t("explore.own.notSaved"));
    location.hash = `#settings/study/packs/${encodeURIComponent(saved.pack.id)}/edit`;
  };
  start.addEventListener("click", go);
  name.addEventListener("keydown", (event) => event.key === "Enter" && (event.preventDefault(), go()));
  name.addEventListener("input", () => (status.textContent = ""));
  return el(
    "section",
    { class: "lx-stack lx-own-hand" },
    ui.sectionHead(t("explore.own.byHand")),
    el("p", { class: "lx-muted" }, t("explore.own.byHandNote")),
    el("label", { class: "lx-stack lx-ask-field" }, el("span", { class: "lx-choice-title" }, t("explore.own.name")), name),
    start,
    status,
  );
}

/** Only with an AI connected: the words to ask it for a pack, on what you say and at a level you pick, with Copy. */
function withYourAi(lang) {
  const state = { level: "" };
  const about = el("input", { part: "text-field", maxlength: ABOUT_LIMIT, placeholder: t("explore.own.aboutHint"), "aria-label": t("explore.own.about") });
  const words = el("p", { class: "lx-yours-prompt-words" });
  const said = el("span", { class: "lx-small lx-muted", role: "status" });
  const promptNow = () => {
    const topic = about.value.trim();
    const values = { language: languageName(lang), level: state.level, about: topic };
    if (topic) return t(state.level ? "explore.own.promptLevel" : "explore.own.prompt", values);
    return t(state.level ? "explore.own.promptAskLevel" : "explore.own.promptAsk", values);
  };
  const draw = () => {
    words.textContent = promptNow();
    said.textContent = "";
  };
  about.addEventListener("input", draw);
  // The level as a row with its value, its choices in a sheet: seven of them don't fit a phone's width side by side at a press's size.
  const levelValue = el("span", {}, t("explore.own.anyLevel"));
  const pickLevel = () => {
    const sheet = ui.sheetLayer({ label: t("explore.own.level") });
    const options = [["", t("explore.own.anyLevel")], ...LEVELS.map((l) => [l, l])];
    sheet.lxBody.append(
      el(
        "div",
        { class: "lx-stack", "data-settings": "" },
        el("h2", { class: "lx-sheet-title" }, t("explore.own.level")),
        ui.group(
          null,
          options.map(([value, label]) =>
            ui.radioRow({ title: label, name: "own-level", value, checked: value === state.level, onchange: () => (sheet.lxClose(), (state.level = value), (levelValue.textContent = label), draw()) }),
          ),
        ),
      ),
    );
    sheet.lxOpen();
  };
  const level = ui.listRow({ title: t("explore.own.level"), value: levelValue, opens: "sheet", onclick: pickLevel });
  const copy = ui.button(t("explore.yours.copy"), {
    variant: "gray",
    size: "sm",
    icon: "copy",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(promptNow());
        said.textContent = t("explore.yours.copied");
      } catch {
        said.textContent = t("explore.yours.copyFailed");
      }
    },
  });
  draw();
  return el(
    "section",
    { class: "lx-stack lx-own-ai" },
    ui.sectionHead(t("explore.own.withAi")),
    el("p", { class: "lx-muted" }, t("explore.own.withAiSub")),
    el("label", { class: "lx-stack lx-ask-field" }, el("span", { class: "lx-choice-title" }, t("explore.own.about")), about),
    el("ul", { part: "list" }, level),
    el("div", { class: "lx-yours-prompt" }, el("p", { class: "lx-yours-prompt-label" }, t("explore.own.sendIt")), words, copy, said),
  );
}
