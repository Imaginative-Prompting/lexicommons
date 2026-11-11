// Settings → Study → Packs → a pack of yours → Edit its items: search and list them, change a word or sentence and what it means,
// delete one, add a simple one. Everything else an item has stays as it is, and nobody is asked to fill it in. A change goes through
// study/pack-inbox.js changePack, the same check and history as any other, and can be undone.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { setLang } from "../lx/bidi.js";
import { languageName, withoutAccents } from "../lang/index.js";
import { editItem, simpleItem } from "../study/pack-authoring.js";
import { itemSentence } from "../study/pack-format.js";
import { isSentence } from "../study/pack-items.js";
import { allPacks, onPacksChange, packAudio, yourPack } from "../study/packs.js";
import { entersTheDayNew } from "../study/deck.js";
import { changePack, packOnAccount, packSharedHere, undoPackChange } from "../study/pack-inbox.js";
import { isConnected, PROVIDERS } from "../storage.js";
import { twoStepRow } from "./settings.js";
import { lookToast } from "./look-watch.js";

const PAGE_OF = 50;
const FIELD_LIMIT = 400;
const short = (text) => (text.length > 48 ? `${text.slice(0, 47)}…` : text);
const textOf = (item, language) => (item.words ? itemSentence(item, language) : item.text);
// A check's message as a person reads it: without where in the pack it was.
const plainProblem = (problem) => String(problem?.message ?? "That didn't pass the check.").replace(/^items\[\d+\][^:]*:\s*/, "");
const hasDetail = (item) => Boolean(item.words || item.literal || item.wrong || item.gap);
// Where a new simple item comes in, as study/deck.js has it: an imported deck brings new ones only when it's opened.
const comesIntoPractice = (id) => entersTheDayNew(allPacks().find((pack) => pack.id === id));
const hasRecording = (id, itemId) => Object.values(packAudio(id)?.voices ?? {}).some((voice) => voice?.items?.[itemId]);

// What the page can promise about where a change goes, and no more.
function reachLine(id) {
  if (packOnAccount(id)) return `Changes reach your other devices.${packSharedHere(id) ? " Explore keeps the version you shared until you share this one." : ""}`;
  if (Object.keys(PROVIDERS).some((provider) => isConnected(provider))) return "Changes reach your other devices through your own storage. If two devices change this pack before they sync, one device's changes are lost.";
  return "Changes stay on this device.";
}

/** A labeled box to write in, as a sheet's fields are. */
function writing(label, value, lang) {
  const box = el("textarea", { part: "text-field", "data-writing": "", rows: 2, maxlength: FIELD_LIMIT, lang, "aria-label": label, autocapitalize: "sentences", autocorrect: "off", spellcheck: "false" });
  box.value = value ?? "";
  // As tall as what's in it, so a long sentence is all there to read and nothing scrolls inside the box.
  const grow = () => {
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight + 2}px`;
  };
  box.addEventListener("input", grow);
  return { box, grow, row: el("label", { class: "lx-stack" }, el("span", { class: "lx-small lx-muted" }, label), box) };
}

export function packEditSettings(page, id) {
  const back = { href: `#settings/study/packs/${encodeURIComponent(id)}`, label: "Pack" };
  let query = "";
  let shown = PAGE_OF;
  let disposed = false;
  const results = el("div", { class: "lx-stack" });
  const reach = el("p", { class: "lx-small lx-muted" });

  const packNow = () => yourPack(id)?.pack ?? null;

  const save = async (status, change, said, done) => {
    status.textContent = "Saving…";
    const result = await changePack(id, change, said);
    if (!result.ok) {
      status.textContent = plainProblem(result.errors?.[0]);
      return false;
    }
    status.textContent = "";
    done();
    lookToast("right", result.onItsWay ? "Saved. It's on its way to this device." : said[0].toUpperCase() + said.slice(1), {
      undo: async () => {
        const undone = await undoPackChange(result.changeId);
        lookToast(undone.ok ? "right" : "wrong", undone.ok ? "Undone" : undone.error);
      },
    });
    return true;
  };

  const openItem = (itemId) => {
    const pack = packNow();
    const item = pack?.items.find((one) => one.id === itemId);
    if (!item) return;
    const layer = ui.sheetLayer({ label: "Edit" });
    const text = writing(`In ${languageName(pack.language)}`, textOf(item, pack.language), pack.language);
    const means = writing(`In ${languageName(pack.from)}`, item.means, pack.from);
    const reading = item.reading ? writing("How it's said", item.reading, pack.language) : null;
    const warn = el("p", { class: "lx-small", role: "status", "data-rewrite": "", hidden: true });
    const status = el("p", { class: "lx-small", role: "status" });
    const saveButton = ui.button("Save", { variant: "go", size: "lg", block: true });
    let saving = false;
    const recorded = hasRecording(id, item.id);
    const stays = hasDetail(item) ? el("p", { class: "lx-small lx-muted", "data-stays": "" }, recorded ? "Its word-by-word help and recording stay as they are." : "Its word-by-word help stays as it is.") : null;
    const asked = () => ({ text: text.box.value, means: means.box.value, ...(reading ? { reading: reading.box.value } : {}) });
    const look = () => {
      const { rewrite, sentenceBefore } = editItem(item, asked(), pack.language);
      warn.hidden = !rewrite;
      if (stays) stays.hidden = rewrite;
      if (rewrite) {
        const what = [
          "This changes more than a spelling fix, so its word-by-word help won't fit and goes.",
          sentenceBefore ? `It becomes a simple item and starts again as new. ${comesIntoPractice(id) ? "Practice brings in up to two new items at a time." : "You'll meet it when you open this deck."}` : "It becomes a simple item.",
          recorded ? "Its recording goes too." : "",
        ];
        warn.textContent = what.filter(Boolean).join(" ");
      }
      saveButton.textContent = rewrite ? "Save as a simple item" : "Save";
    };
    text.box.addEventListener("input", look);
    saveButton.addEventListener("click", async () => {
      if (saving) return;
      const { item: next, problems } = editItem(item, asked(), pack.language);
      if (problems.length) return void (status.textContent = plainProblem(problems[0]));
      if (JSON.stringify(next) === JSON.stringify(item)) return layer.lxClose();
      saving = true;
      await save(status, { kind: "update", items: [next] }, `changed “${short(textOf(next, pack.language))}”`, () => layer.lxClose());
      saving = false;
    });
    layer.lxBody.replaceChildren(
      el("h2", { part: "group-label" }, "Edit"),
      el(
        "div",
        { class: "lx-stack" },
        text.row,
        means.row,
        reading?.row,
        stays,
        warn,
        saveButton,
        status,
        el(
          "ul",
          { part: "list" },
          twoStepRow({
            icon: "trash",
            title: "Delete it",
            confirm: "Press again to delete it",
            action: () => save(status, { kind: "remove", ids: [item.id] }, `deleted “${short(textOf(item, pack.language))}”`, () => layer.lxClose()),
          }),
        ),
      ),
    );
    layer.lxOpen();
    for (const one of [text, means, reading]) one?.grow();
  };

  const openNew = () => {
    const pack = packNow();
    if (!pack) return;
    const layer = ui.sheetLayer({ label: "Add" });
    const text = writing(`In ${languageName(pack.language)}`, "", pack.language);
    const means = writing(`In ${languageName(pack.from)}`, "", pack.from);
    const status = el("p", { class: "lx-small", role: "status" });
    const add = ui.button("Add", { variant: "go", size: "lg", block: true });
    let saving = false;
    add.addEventListener("click", async () => {
      if (saving) return;
      const taken = new Set(packNow()?.items.map((one) => one.id) ?? []);
      const { item, problems } = simpleItem({ text: text.box.value, means: means.box.value }, { language: pack.language, taken });
      if (!item) return void (status.textContent = plainProblem(problems[0]));
      saving = true;
      await save(status, { kind: "add", items: [item] }, `added “${short(item.text)}”`, () => layer.lxClose());
      saving = false;
    });
    layer.lxBody.replaceChildren(
      el("h2", { part: "group-label" }, "Add a word or sentence"),
      el("div", { class: "lx-stack" }, text.row, means.row, el("p", { class: "lx-small lx-muted" }, comesIntoPractice(id) ? "It comes into Practice as a new item. Practice brings in up to two at a time." : "You'll meet it when you open this deck."), add, status),
    );
    layer.lxOpen();
    for (const one of [text, means]) one.grow();
  };

  const draw = () => {
    if (disposed) return;
    const pack = packNow();
    reach.textContent = reachLine(id);
    if (!pack) {
      results.replaceChildren(ui.emptyState("That pack isn't one of yours on this device.", { pose: "shrug" }));
      return;
    }
    const wanted = withoutAccents(query.toLowerCase());
    const matches = wanted ? pack.items.filter((item) => withoutAccents(`${textOf(item, pack.language)} ${item.means ?? ""}`.toLowerCase()).includes(wanted)) : pack.items;
    const rows = matches.slice(0, shown).map((item) => {
      const row = ui.listRow({ title: textOf(item, pack.language), sub: item.means, opens: "sheet", onclick: () => openItem(item.id) });
      const title = row.querySelector(".lx-row-title");
      if (title) setLang(title, pack.language);
      return row;
    });
    const more = matches.length - shown;
    const counted = `${matches.length.toLocaleString()} ${matches.length === 1 ? "item" : "items"}${wanted ? ` of ${pack.items.length.toLocaleString()}` : ""}`;
    results.replaceChildren(
      matches.length
        ? ui.group(counted, [
            ...rows,
            more > 0 ? ui.listRow({ icon: "plus", title: `Show ${Math.min(more, PAGE_OF).toLocaleString()} more`, sub: `${more.toLocaleString()} left`, onclick: () => ((shown += PAGE_OF), draw()) }) : null,
          ].filter(Boolean))
        : ui.emptyState(wanted ? "Nothing in this pack says that." : "This pack has no items yet.", { pose: "shrug" }),
    );
  };

  const search = ui.searchField({ label: "Search its items", onsubmit: (value) => ((query = value), (shown = PAGE_OF), draw()) });
  let typing = null;
  search.querySelector("input").addEventListener("input", (event) => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      query = event.target.value.trim();
      shown = PAGE_OF;
      draw();
    }, 120);
  });
  const pack = packNow();
  page.replaceChildren(
    ui.pageTitle("Edit its items", pack?.name),
    // Words only (no symbol, no line explaining it): its sheet asks for the word and what it means.
    ui.group(null, [ui.listRow({ title: "Add a word or sentence", opens: "sheet", onclick: openNew })]),
    search,
    results,
    reach,
  );
  draw();
  const stop = onPacksChange(draw);
  return {
    title: "Edit its items",
    back,
    dispose: () => {
      disposed = true;
      clearTimeout(typing);
      stop();
    },
  };
}
