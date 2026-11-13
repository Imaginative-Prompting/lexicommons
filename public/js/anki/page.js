// Add an Anki deck: pick a file (or, on a computer, drop one anywhere here), see it read with real progress, then a plain
// report of what it holds and which games it gets, and add it. It stays on this device until someone shares it. The parser is
// loaded only from here (main bundle: none of this is in the shell). Built from the design system, as Read's Add a text is.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { symbol } from "../lx/symbols.js";
import { wordsRow } from "../shell/settings.js";
import { LANGUAGES, isOwnLanguage, languageName, ourLanguages, ownLanguageDef, ownLanguageProblem, sameOwnLanguage, withOwnLanguage } from "../lang/index.js";
import { guessDefinition, suggestCode } from "./own-language.js";
import { checkPack } from "../study/pack-format.js";
import { allPacks, savePack, setPackOn } from "../study/packs.js";
import { fromFor, learning, learningFrom, setLearning } from "../study/learning.js";
import { speaks } from "../shell/interface-language.js";
import { gamesReport, leftOutLines, packOf } from "./deck.js";
import { readDeckFile } from "./import.js";
import { saidAloud } from "../study/deck.js";

const GAME_NAMES = { card: "Study cards", type: "Type it", match: "Match", choose: "Choose", fill: "Fill the gap", listen: "Listening", arrange: "Word order", say: "Say it" };
const STAGE = { opening: "Opening the file", reading: "Reading its cards", sounds: "Keeping its sounds" };

const separatorOfLang = (code) => LANGUAGES[code]?.separator ?? " ";
const count = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function ankiImportPage(page) {
  page.setAttribute("data-settings", ""); // the same quiet rows and title as Settings' pages
  const say = el("p", { class: "lx-settings-message", role: "status" });
  let stopped = false;
  let current = null; // the file being read: its close()

  // The start. With `failed`, what went wrong, in words, with Tinta slumping beside them and the way forward still the button.
  const start = (failed) => {
    say.removeAttribute("data-tone");
    say.replaceChildren();
    const choose = ui.button(failed ? "Choose another file" : "Choose a file", { variant: "go", block: true, onclick: () => input.click() });
    choose.setAttribute("aria-label", "Choose a file");
    page.replaceChildren(
      ui.pageTitle("Add an Anki deck", "An .apkg or .colpkg file. It stays on this device unless you share it."),
      el("div", { class: "lx-anki-start" }, symbol("deck-art", { size: 120 }), el("div", { class: "lx-stack" }, choose, say, input)),
    );
    if (!failed) return;
    const tinta = ui.character({ size: 32, hidden: true });
    say.setAttribute("data-tone", "wrong");
    say.replaceChildren(tinta, el("span", {}, failed));
    ui.slumpCharacter(tinta, choose, say);
  };

  const input = el("input", { type: "file", hidden: true, "aria-label": "Choose an Anki deck" });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) read(file);
  });

  async function read(file) {
    current?.close();
    say.removeAttribute("data-tone");
    say.replaceChildren();
    const bar = ui.downloadBar({ label: "Reading the deck", tinta: false });
    const line = el("p", { class: "lx-small lx-muted", role: "status" }, STAGE.opening);
    page.replaceChildren(ui.pageTitle("Reading the deck", file.name), el("div", { class: "lx-stack", "data-anki": "reading" }, bar, line));
    try {
      const result = await readDeckFile(file, {
        onProgress: ({ stage, done, total }) => {
          line.replaceChildren(total ? `${STAGE[stage]}: ${done.toLocaleString()} of ${total.toLocaleString()}` : STAGE[stage]);
          if (total) bar.set(done / total);
        },
      });
      if (stopped) return result.close();
      current = result;
      report(result);
    } catch (error) {
      if (stopped) return;
      start(error.message);
    }
  }

  function report(result) {
    const { deck } = result;
    if (!deck.cards.length) {
      result.close();
      start(`${deck.name} has no cards Lexicommons can use: ${leftOutLines(deck).join(" ") || "nothing in it has words on both sides."}`);
      return;
    }
    let language = deck.language.language;
    let from = deck.language.from ?? learningFrom();
    let swap = deck.language.swap;
    // A language Lexicommons doesn't list, named on this page (Another language…): its definition, until the pack keeps it on this device.
    let languageDef = null;
    if (from === language) from = language === "en" ? null : "en";

    const draw = () => {
      // Such a language is known for this drawing only (lang/index.js withOwnLanguage): its separator, its name, its pack's check.
      const known = (fn) => (languageDef ? withOwnLanguage(language, languageDef, fn) : fn());
      const again = known(() => allPacks().find((pack) => pack.id === packOf(deck, { language: language ?? "en", from: from ?? "en", swap, languageDef }).pack.id));
      const asking = !language || !from || deck.language.unsureAbout;
      const sounded = new Set(deck.cards.filter((card) => card.sounds?.length).map((card) => card.id));
      const shown = known(() => packOf(deck, { language: language ?? "en", from: from ?? "en", swap, languageDef }).pack.items);
      const games = known(() => gamesReport(shown, { sounded: deck.soundsHere ? sounded : new Set(), separator: separatorOfLang(language), says: (item) => saidAloud(item, { language: language ?? "en", from: from ?? "en" }) }));
      const left = leftOutLines(deck);
      const sample = shown[0];
      const add = ui.button(again ? "Replace my copy" : "Add to my packs", { variant: "go", block: true });
      add.disabled = !language || !from;
      add.addEventListener("click", () => adding(result, { language, from, swap, languageDef }, add));
      const teaches = (code, def = null) => {
        language = code;
        languageDef = def;
        if (from === code) from = code === "en" ? null : "en";
        deck.language.unsureAbout = null;
        draw();
      };
      const languages = ui.group(
        "Language",
        [
          languageRow("It teaches", language, (code) => teaches(code), {
            name: languageDef?.name,
            another: (layer) => anotherLanguage(deck, swap, (code, def) => teaches(code, def), layer),
          }),
          // What its cards are explained in: a language Lexicommons lists (the app's words, and a pack's meanings, are in one).
          languageRow("Explained in", from, (code) => {
            from = code;
            draw();
          }, { codes: ourLanguages() }),
        ],
      );
      // Asked first, in words, when the deck doesn't say which languages it's in: the one thing to settle before it's added.
      const ask = el("p", { class: "lx-anki-ask" }, "We couldn't tell for sure from the deck which languages it's in, so check these.");
      const swapped = swap !== deck.language.swap;
      const card = sample
        ? el(
            "figure",
            { class: "lx-anki-sample" },
            el("figcaption", { class: "lx-anki-sample-label" }, "What you'll learn"),
            el("p", { class: "lx-anki-sample-front", lang: language ?? undefined }, sample.text),
            sample.means ? el("p", { class: "lx-anki-sample-back", lang: from ?? undefined }, sample.means) : null,
            ui.button("Swap sides", {
              size: "sm",
              variant: "fade",
              pressed: swapped ? "true" : "false",
              onclick: () => {
                swap = !swap;
                draw();
              },
            }),
          )
        : null;
      const gameNames = Object.entries(games).filter(([, n]) => n).map(([game]) => GAME_NAMES[game]);
      page.replaceChildren(
        ui.pageTitle(deck.name, deck.description || null),
        ...(asking ? [ask, languages] : []),
        ...(card ? [card] : []),
        el(
          "section",
          { class: "lx-anki-what" },
          el("p", { class: "lx-anki-count" }, el("strong", {}, shown.length.toLocaleString()), ` ${shown.length === 1 ? "card" : "cards"}`),
          el("p", { class: "lx-anki-sounds" }, deck.soundsHere ? `${count(deck.soundsHere, "card")} with sound, which stays on this device` : "No sound came with it"),
          el("p", { class: "lx-anki-games" }, el("span", { class: "lx-anki-games-label" }, "Its games"), gameNames.join(", ")),
        ),
        ...(asking ? [] : [languages]),
        el("ul", { part: "list" }, wordsRow("How its cards are studied", "Each card plays only the games it has what it takes for.", "Everything goes through Lexicommons' own schedule; a deck's history in Anki doesn't come across.")),
        ...(left.length ? [ui.group("Left out", left.map((text) => ui.listRow({ title: text })))] : []),
        el("div", { class: "lx-stack lx-anki-other" }, say, ui.button("Choose another file", { variant: "fade", onclick: () => { result.close(); start(); } }), input),
        ui.pinnedActions([add]),
      );
    };
    draw();
  }

  /**
   * A choice of language: its row, and the sheet it opens. codes: what it lists (every language there is, a learner's own among them, by
   * default); name: the name of one this device doesn't know yet (Another language…'s); another: Another language…, under the list.
   */
  function languageRow(title, code, onPick, { codes = Object.keys(LANGUAGES), name = null, another = null } = {}) {
    // Its sheet draws its first rows' flags at once, the first time too (lx/ui.js warmFlags).
    ui.warmFlags(codes.slice(0, ui.FLAG_ROWS_SHOWN));
    const pick = () => {
      const layer = ui.sheetLayer({ label: title });
      layer.lxBody.append(
        el(
          "div",
          { class: "lx-stack" },
          el("h2", { class: "lx-sheet-title" }, title),
          el(
            "ul",
            { part: "list" },
            codes.map((key, i) =>
              ui.radioRow({
                title: [ui.languageFlag(key, { lazy: i >= ui.FLAG_ROWS_SHOWN }), languageName(key)],
                name: `anki-${title}`,
                value: key,
                checked: key === code,
                onchange: (value) => {
                  layer.lxClose();
                  onPick(value);
                },
              }),
            ),
          ),
          // One Lexicommons doesn't list: named here, its pack's own.
          another
            ? el("ul", { part: "list" }, ui.listRow({ title: "Another language…", sub: "One that isn't listed: a dialect, a language few speak, one you're making", onclick: () => another(layer) }))
            : null,
        ),
      );
      layer.lxOpen();
    };
    const shown = code && name ? [ui.languageMark(name), name] : code ? [ui.languageFlag(code), languageName(code)] : "Choose";
    return ui.listRow({ title, value: shown, opens: "sheet", onclick: pick });
  }

  /**
   * Another language…: a language Lexicommons doesn't list, for this deck. Its name; its code, made from the name (und-x-…) until one is
   * typed (its ISO 639 code where it has one: kw for Cornish); and how it's written, guessed from the side of its cards in it
   * (own-language.js guessDefinition), each changeable. Checked by a pack's rules (lang/index.js ownLanguageProblem) before it's used:
   * onUse(code, definition). In the sheet the list was in (host), which it fills: one sheet, never one opened over another as it closes.
   */
  function anotherLanguage(deck, swap, onUse, host = null) {
    const guess = guessDefinition(deck.cards.map((card) => (swap && !card.cloze ? card.back : card.front)));
    const def = { direction: guess.direction, written: guess.written, case: guess.case };
    let typed = false;
    const layer = host ?? ui.sheetLayer({ label: "Another language" });
    const name = el("input", { part: "text-field", type: "text", maxlength: "40", "aria-label": "Its name", placeholder: "Cornish, Gronings, Sindarin…", autocomplete: "off" });
    const code = el("input", { part: "text-field", type: "text", maxlength: "32", "aria-label": "Its code", placeholder: "und-x-…", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false" });
    const ends = el("input", { part: "text-field", type: "text", maxlength: "12", "aria-label": "What else ends a sentence", value: guess.ends.join(" "), autocomplete: "off", spellcheck: "false" });
    name.addEventListener("input", () => {
      if (!typed) code.value = suggestCode(name.value);
    });
    code.addEventListener("input", () => (typed = code.value.trim() !== ""));
    const wrong = el("p", { class: "lx-small", role: "alert" });
    const label = (text, field) => el("label", { part: "field" }, el("span", { class: "lx-small lx-muted" }, text), field);
    const choice = (title, key, options) => el("section", { class: "lx-stack" }, el("h3", { part: "group-label" }, title), ui.segmented(options, def[key], (value) => (def[key] = value), title));
    const use = () => {
      const named = name.value.trim().replace(/\s+/g, " ");
      const tag = code.value.trim();
      if (!named) return void wrong.replaceChildren("Give it a name.");
      const listed = ourLanguages().find((one) => languageName(one).toLowerCase() === named.toLowerCase());
      if (listed) return void wrong.replaceChildren(`${languageName(listed)} is one Lexicommons lists: choose it in the list.`);
      if (!tag) return void wrong.replaceChildren("Give it a code: its ISO 639 code if it has one (kw for Cornish), else und-x- and its name (und-x-sindarin).");
      const definition = { name: named, ...def, ends: ends.value.trim() ? ends.value.trim().split(/\s+/) : [] };
      const problem = ownLanguageProblem(tag, definition);
      if (problem) return void wrong.replaceChildren(problem.message.replace(/^languageDef\.?\w*\s*/, ""));
      if (isOwnLanguage(tag) && !sameOwnLanguage(tag, definition))
        return void wrong.replaceChildren(`${languageName(tag)} is a language of yours already (${tag}), written another way: choose it in the list, or give this one another code.`);
      layer.lxClose();
      onUse(tag, ownLanguageDef(definition));
    };
    layer.lxBody.replaceChildren(
      el(
        "div",
        { class: "lx-stack" },
        el("h2", { class: "lx-sheet-title" }, "Another language"),
        el("p", { class: "lx-small lx-muted" }, "Its packs, games and Knowledge work as any language's. It has no flag, path or books."),
        label("Its name", name),
        label("Its code: its ISO 639 code if it has one (kw for Cornish), else one made from its name", code),
        el("p", { class: "lx-small lx-muted" }, "How it's written, from this deck's cards. Check each."),
        choice("Direction", "direction", [["ltr", "Left to right"], ["rtl", "Right to left"]]),
        choice("Between words", "written", [["spaces", "Spaces"], ["unspaced", "No spaces"]]),
        choice("Its words", "case", [["lower", "In small letters"], ["any", "As written"]]),
        el("p", { class: "lx-small lx-muted" }, "As written: a script with no small and capital letters, or capitals that matter (names, German's nouns)."),
        label("What else ends a sentence, besides . ? !", ends),
        wrong,
        ui.button("Use it", { variant: "go", block: true, onclick: use }),
      ),
    );
    // From its top (the list it replaces may have been scrolled), in the sheet already up or a new one.
    layer.lxBody.scrollTop = 0;
    layer.lxPanel?.scrollTo?.({ top: 0 });
    if (!host) layer.lxOpen();
    name.focus({ preventScroll: true });
  }

  async function adding(result, { language, from, swap, languageDef = null }, add) {
    add.setAttribute("disabled", "");
    const { deck } = result;
    const { pack, sounds } = packOf(deck, { language, from, swap, languageDef });
    const check = checkPack(pack, { installed: allPacks().filter((other) => other.id !== pack.id) });
    if (!check.pack) {
      add.removeAttribute("disabled");
      say.setAttribute("data-tone", "wrong");
      say.replaceChildren(`It couldn't be added: ${check.errors[0]?.message ?? "it doesn't pass the pack check."}`);
      return;
    }
    const bar = ui.downloadBar({ label: "Keeping its sounds", tinta: false });
    const line = el("p", { class: "lx-small lx-muted", role: "status" }, "Adding it");
    page.replaceChildren(ui.pageTitle("Adding it", deck.name), el("div", { class: "lx-stack", "data-anki": "adding" }, deck.soundsHere ? bar : null, line));
    let clips = {};
    let counts = { kept: 0, skipped: 0, stopped: 0 };
    if (deck.soundsHere) {
      const wanted = Object.entries(sounds).map(([card, names]) => ({ card, names }));
      const out = await result.keepSounds(wanted, ({ done, total }) => {
        line.replaceChildren(`Keeping its sounds: ${done.toLocaleString()} of ${total.toLocaleString()}`);
        bar.set(done / total);
      });
      clips = out.clips;
      counts = out;
    }
    result.close();
    current = null;
    const saved = await savePack(pack, { by: "An Anki deck", sounds: clips });
    if (stopped) return;
    if (!saved.ok) {
      start(`It couldn't be added: ${saved.errors[0]?.message ?? "it doesn't pass the pack check."}`);
      return;
    }
    setPackOn(pack.id, true);
    done(saved.pack, counts);
  }

  function done(pack, counts) {
    page.replaceChildren(
      el("div", { class: "lx-anki-start lx-anki-done-art" }, symbol("deck-art", { size: 96 })),
      ui.pageTitle("It's in your packs", `${pack.name}: ${count(pack.items.length, "card")} in ${languageName(pack.language)}.${pack.language === learning() ? "" : ` Studying it switches you to ${languageName(pack.language)}.`}`),
      ...(counts.kept ? [el("p", { class: "lx-small lx-muted" }, `${count(counts.kept, "sound")} kept on this device.`)] : []),
      ...(counts.stopped ? [el("p", { class: "lx-small lx-muted" }, `Sounds for ${count(counts.stopped, "card")} didn't fit on this device; those cards work without them.`)] : []),
      el(
        "div",
        { class: "lx-stack", "data-anki": "added" },
        // Studying it is what switches the language, not adding it: switching draws every page again, this one too.
        ui.button("Study it", {
          variant: "go",
          block: true,
          onclick: () => {
            if (learning() !== pack.language) setLearning(pack.language, pack.from && pack.from !== pack.language ? pack.from : fromFor(pack.language, speaks()));
            location.hash = `#study/session/deck/${encodeURIComponent(pack.id)}`;
          },
        }),
        ui.button("See the pack", { variant: "calm", block: true, onclick: () => (location.hash = `#settings/study/packs/${encodeURIComponent(pack.id)}`) }),
        ui.button("Add another deck", { variant: "fade", block: true, onclick: start }),
      ),
    );
  }

  // A file dropped anywhere while this page shows comes in like a picked one.
  const over = (event) => [...(event.dataTransfer?.types ?? [])].includes("Files") && event.preventDefault();
  const drop = (event) => {
    if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) read(file);
  };
  addEventListener("dragover", over);
  addEventListener("drop", drop);
  start();
  return {
    title: "Add an Anki deck",
    back: { href: "#study/packs", label: "Your packs" },
    dispose() {
      stopped = true;
      current?.close();
      removeEventListener("dragover", over);
      removeEventListener("drop", drop);
    },
  };
}
