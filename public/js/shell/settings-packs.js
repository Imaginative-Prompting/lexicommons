// Settings → Language: the language you're learning, from the ones there's a pack for on this device.
// Settings → Study → Packs: every pack for that language, each on or off for studying (a pack that's off is left out;
// what you learned from it stays), each opening its own page: where it's from, its sentences, its recorded voices
// (keep one, or let them take turns), what the rest of the app offers for it (pack-actions.js), and for a pack of
// yours, a way to edit its items (settings-pack-edit.js), the changes made to it (the latest can be undone) and delete
// (study/pack-inbox.js).

import { plainItems, sentencesOf } from "../study/pack-items.js";
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { setLang } from "../lx/bidi.js";
import { languageName } from "../lang/index.js";
import { ITEMS, PACK, PACKS, TOPICS, onContentChange, packLanguages, sentence } from "../study/content.js";
import { allPacks, deletedElsewhere, isPackOn, keepingNow, libraryPacks, onKeeping, onKeptChange, onPacksChange, packProblems, restorePack, RESTORE_DAYS, setPackOn, yourPacks } from "../study/packs.js";
import { deletePackEverywhere, missingPacks, packChanges, packOnAccount, undoPackChange } from "../study/pack-inbox.js";
import { fromFor, learning, learningFrom, learningName, setLearning } from "../study/learning.js";
import { packActions } from "../study/pack-actions.js";
import { deckLine, deckOverview } from "../study/deck.js";
import { getStudySettings, setStudySetting } from "../study/settings.js";
import * as voice from "../study/voice.js";
import { drawnEmpty, twoStepRow, wordsRow } from "./settings.js";
import { lookToast } from "./look-watch.js";
import { openLanguageSheet, primeLanguageChoices } from "./welcome.js";
import { canGrow, iSpeak, interfaceSetting, isShipped, onInterfaceChange, setAppLanguage, setGrow, setISpeak, speaks } from "./interface-language.js";
import { shippedLocales } from "../lx/locales.js";
import { languageLabel, t } from "../lx/i18n.js";

const SHOWN_SENTENCES = 200;
const toPacks = { href: "#study/packs", label: "Your packs" };

// Where a pack is from, in a few words.
const FROM = { app: "Lexicommons", default: "Lexicommons", follow: "Following", yours: "Yours" };
const fromOf = (pack) => FROM[pack.origin?.kind] ?? "Lexicommons";
const sentencesText = (n) => `${n.toLocaleString("en")} ${n === 1 ? "sentence" : "sentences"}`;
const sizeText = (pack) => [pack.items ? sentencesText(pack.items) : null, pack.cards ? `${pack.cards.toLocaleString()} ${pack.cards === 1 ? "card" : "cards"}` : null].filter(Boolean).join(" · ") || sentencesText(0);
const day = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
// A row of facts: a short value at its end, a longer one under its title (where it shows in full).
// A row showing a value: at its end when short, under its title when long. value may be text with flags in it.
// A value too long for the row's end (half the row: about 24 characters, a flag about 4) goes under its title instead: counting only the words,
// About it's "Dutch, from English" with its two flags ran 15 px past the end's box, which cut the first flag.
const widthOf = (value) => [value].flat().reduce((n, part) => n + (typeof part === "string" ? part.length : part ? 4 : 0), 0);
const staticRow = (title, value) => (widthOf(value) > 24 ? ui.listRow({ title, sub: value }) : ui.listRow({ title, value }));
// A language as a row shows it: its flag, then its name.
// (i: a row's place in a long list, whose rows past its first screenful load their flags as they come near: ui.FLAG_ROWS_SHOWN.)
const flagged = (code, i = 0) => [ui.languageFlag(code, { lazy: i >= ui.FLAG_ROWS_SHOWN }), languageName(code)];
/** A pack's language and the one it's learned from ("Dutch, from English"): the second flag as far from the words before it as from its name. */
const fromLine = (lang, from) => {
  const [flag, name] = flagged(from);
  flag?.classList.add("lx-flag-mid");
  return [...flagged(lang), flag ? ", from" : ", from ", flag, name];
};
// A page's parts, leaving out the ones that don't apply (null would show as text).
const show = (page, ...parts) => page.replaceChildren(...parts.filter(Boolean));

/** What Settings → Study's Packs row says: how many of the language's packs are on. */
export function packsSummary() {
  const on = PACKS.filter((pack) => pack.on).length;
  return on === PACKS.length ? `${PACKS.length} on` : `${on} of ${PACKS.length} on`;
}

// Re-renders a page whenever the packs or what studying draws on change (and whatever else is given: a pack's voices
// arriving); returns its dispose.
function live(draw, ...more) {
  draw();
  const stops = [onPacksChange(draw), onContentChange(draw), ...more.map((subscribe) => subscribe(draw))];
  return () => stops.forEach((stop) => stop());
}

// ---------- Language ----------

export function languageSettings(page) {
  // The languages its sheet will offer, asked for now, so the sheet opens showing only them (welcome.js).
  primeLanguageChoices();
  const named = (code) => [ui.languageFlag(code), languageLabel(code)];
  // I speak, for now: English, and what's already chosen when it's another (so the row never says what isn't so); a quiet line says more
  // are coming. App language's sheet (below) offers what has shipped, with the same line.
  const englishFirst = (title, codes, chosen, onpick) => {
    const sheet = ui.sheetLayer({ label: title });
    const list = [...new Set(["en", ...codes.filter(Boolean)])];
    sheet.lxBody.append(
      el(
        "div",
        { class: "lx-stack", "data-settings": "" },
        el("h2", { class: "lx-sheet-title" }, title),
        ui.group(
          null,
          list.map((code) => ui.radioRow({ title: named(code), name: "words-in", value: code, checked: code === chosen, onchange: () => (sheet.lxClose(), onpick(code)) })),
          t("settings.language.moreComing"),
        ),
      ),
    );
    sheet.lxOpen();
  };
  const openSpeak = () => englishFirst(t("settings.language.iSpeak"), [iSpeak()], iSpeak() ?? "en", (code) => setISpeak(code));
  // The app's words: the language you speak, or one you live in while you learn. Only a language the app is in can be picked.
  const openAppSheet = () => {
    const sheet = ui.sheetLayer({ label: t("settings.language.appSheet") });
    const { app } = interfaceSetting();
    const speak = iSpeak();
    const choices = [null, ...shippedLocales().filter((code) => code !== speak)];
    sheet.lxBody.append(
      el(
        "div",
        { class: "lx-stack" },
        el("h2", { class: "lx-sheet-title" }, t("settings.language.appSheet")),
        ui.group(
          null,
          choices.map((code) =>
            ui.radioRow({
              title: code ? named(code) : t("settings.language.sameAsISpeak"),
              sub: code ? undefined : speak ? languageLabel(speak) : undefined,
              name: "app-language",
              value: code ?? "",
              checked: (code ?? null) === app,
              onchange: () => {
                setAppLanguage(code);
                sheet.lxClose();
              },
            }),
          ),
          t("settings.language.appSheetNote"),
        ),
      ),
    );
    sheet.lxOpen();
  };
  const draw = () => {
    const codes = packLanguages();
    if (!codes.includes(learning())) codes.unshift(learning());
    const speak = iSpeak();
    const { app, grow } = interfaceSetting();
    const learnt = languageLabel(learning());
    show(
      page,
      ui.pageTitle("Language"),
      ui.pickList(
        t("settings.language.learning"),
        codes.map((code, i) =>
          ui.radioRow({
            title: flagged(code, i),
            name: "learning",
            value: code,
            checked: code === learning(),
            onchange: (value) => setLearning(value, fromFor(value, speaks())),
          }),
        ),
      ),
      ui.group(null, [ui.listRow({ title: "Add a language", opens: "sheet", onclick: openLanguageSheet })]),
      // While the app is in English alone (the 6 Nov audit), I speak, App language and Grow are one quiet line; once another language has
      // shipped, they come back as rows.
      ...(shippedLocales().some((code) => code !== "en")
        ? [
          // The language you speak (the first run asked it): the app's words come in it, or in English with a plain word why.
          ui.group(
            null,
            [ui.listRow({ title: t("settings.language.iSpeak"), value: speak ? named(speak) : t("settings.language.notSet"), opens: "sheet", onclick: openSpeak })],
            // Only what would surprise: the app isn't in that language yet.
            speak && !isShipped(speak) ? t("settings.language.notReady", { language: languageLabel(speak) }) : undefined,
          ),
          // The app's words: the same as I speak, or another language to live in; and, while they follow I speak, Grow.
          ui.group(
            null,
            [
              ui.listRow({ title: t("settings.language.appLanguage"), value: app ? named(app) : t("settings.language.sameAsISpeak"), opens: "sheet", onclick: openAppSheet }),
              app
                ? null
                : canGrow()
                  ? ui.switchRow({ title: t("settings.language.grow", { language: learnt }), sub: t("settings.language.growSub", { language: learnt }), checked: grow, onchange: (on) => setGrow(on) })
                  : ui.listRow({ title: t("settings.language.grow", { language: learnt }), sub: t("settings.language.growNotReady", { language: learnt }) }),
            ].filter(Boolean),
          ),
          ]
        : [el("p", { class: "lx-small lx-muted lx-language-line" }, t("settings.language.englishOnly"))]),
    );
  };
  return { title: "Language", dispose: live(draw, onInterfaceChange) };
}

// ---------- Packs ----------

/**
 * Turns a pack on or off a frame after the switch has moved: the change rebuilds what studying draws on from every pack, and done in the
 * press it held the switch still until it finished (on a phone, a long moment).
 */
export const togglePack = (id, on) => requestAnimationFrame(() => setTimeout(() => setPackOn(id, on), 0));

/** What studying runs on now: the packs that are on and how many sentences they hold (the foot of Your packs). */
function packsLine() {
  const on = PACKS.filter((pack) => pack.on);
  if (!on.length) return "No pack is turned on.";
  const count = ITEMS.length.toLocaleString("en");
  if (on.length === 1 && on[0].builtIn) return `Running on the built-in ${on[0].name} (${count} sentences).`;
  return `Running on ${on.length === 1 ? on[0].name : `${on.length} packs (${on.map((pack) => pack.name).join(", ")})`}: ${count} sentences.`;
}

/** Your packs: one page, from Study (#study/packs) and Settings (#settings/study/packs). */
export function packsSettings(page, back) {
  const draw = () => {
    const problems = packProblems();
    const missing = missingPacks();
    const deleted = deletedElsewhere();
    const day = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    show(
      page,
      ui.pageTitle("Your packs"),
      // Each pack: its name to its page, its switch turning it on or off here. Lexicommons' own first, then the rest (yours, and what
      // you added from Explore), by space.
      ...(PACKS.length
        ? [true, false].map((own) => {
            const these = PACKS.filter((pack) => (fromOf(pack) === "Lexicommons") === own);
            return these.length
              ? ui.group(
                  null,
                  these.map((pack) =>
                    ui.switchLinkRow({
                      title: pack.name,
                      sub: own ? sizeText(pack) : `${sizeText(pack)} · ${fromOf(pack)}`,
                      href: `#settings/study/packs/${encodeURIComponent(pack.id)}`,
                      checked: pack.on,
                      label: `Study with ${pack.name}`,
                      chevron: false,
                      onchange: (checked) => togglePack(pack.id, checked),
                    }),
                  ),
                  !own && PACKS.every((pack) => !pack.on) ? "Every pack is off, so Study has nothing to draw on. Turn one on to study again." : null,
                )
              : null;
          })
        : [drawnEmpty("empty-packs", `No packs for ${learningName()} on this device.`, "box")]),
      ui.group(null, [
        ui.listRow({ title: "Find packs in Explore", href: "#explore" }),
        ui.listRow({ title: "Add an Anki deck", href: "#study/import?from=packs" }),
      ]),
      // The foot: what studying runs on now.
      el("p", { class: "lx-small lx-muted lx-packs-line" }, packsLine()),
      problems.length
        ? ui.namedGroup(
            "Not used",
            problems.map((problem) => ui.listRow({ title: problem.id.replace(/^library:/, ""), sub: problem.errors[0]?.message ?? "It doesn't pass the check." })),
            "Packs on this device that don't pass the check right now, so studying leaves them out.",
          )
        : null,
      missing.length
        ? ui.namedGroup(
            "On your other device",
            missing.map((pack) => ui.listRow({ title: pack.name, sub: "Your AI changed this pack, but it isn't on this device" })),
            "Packs from your AI are on your other device: your AI made them before this device first opened Lexicommons. What it changes from now on comes to both.",
          )
        : null,
      deleted.length
        ? ui.namedGroup(
            "Deleted on another device",
            deleted.map((pack) =>
              ui.listRow({
                title: pack.name,
                sub: `Deleted ${day(pack.at)} · you can restore it until ${day(pack.until)}`,
                trailing: ui.button("Restore", {
                  size: "sm",
                  onclick: async () => {
                    const result = await restorePack(pack.id);
                    lookToast(result.ok ? "right" : "wrong", result.ok ? `${pack.name} is back` : (result.errors[0]?.message ?? "It couldn't be restored."));
                  },
                }),
              }),
            ),
            `A pack deleted on another device, through your storage, is kept here for ${RESTORE_DAYS} days. Restored, it comes back on your other devices too.`,
          )
        : null,
    );
  };
  return { title: "Your packs", back, dispose: live(draw) };
}

// ---------- one pack ----------

/** Everything this device knows about a pack: the pack, where it's from, and its record. Null when it isn't here. */
function packInfo(id) {
  const pack = allPacks().find((p) => p.id === id);
  if (!pack) return null;
  const kind = pack.origin?.kind ?? "app";
  const record = kind === "yours" ? yourPacks().find((r) => r.id === id) : null;
  const copy = kind === "default" || kind === "follow" ? libraryPacks().find((p) => p.id === id) : null;
  return { pack, kind, record, copy, on: isPackOn(id), version: copy?.version };
}

/** A pack's about as its page says it under its name: its first sentence; all of it is under About it. */
const firstSentence = (text) => (text ? (/^.+?[.!?](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim()) : undefined);

function aboutRows({ pack, kind, record, copy }) {
  const rows = [];
  // What it's about, whole, when the page shows only its first sentence.
  if (pack.about && firstSentence(pack.about) !== pack.about.trim()) rows.push(el("li", { class: "lx-row-item lx-pack-about" }, el("p", {}, pack.about)));
  if (kind === "yours") rows.push((record?.by === "An Anki deck" ? staticRow("From", record.by) : staticRow("Made by", record?.by && record.by !== "you" ? record.by : "You")), staticRow("Changed", day(record?.changedAt ?? Date.now())));
  else if (kind === "follow") rows.push(staticRow("From", "The community, followed"), staticRow("Version", copy?.version ?? ""));
  else if (kind === "default") rows.push(staticRow("From", "Lexicommons"), staticRow("Version", `${copy?.version ?? ""} · updates by itself`));
  else rows.push(staticRow("From", "Lexicommons"), staticRow("Version", "The copy inside the app, until the library's arrives"));
  rows.push(staticRow("Language", fromLine(pack.language, pack.from)), ...(sentencesOf(pack).length || !plainItems(pack).length ? [staticRow("Sentences", String(sentencesOf(pack).length))] : []), ...(plainItems(pack).length ? [staticRow("Cards", plainItems(pack).length.toLocaleString())] : []));
  const topics = [...new Set(sentencesOf(pack).map((item) => item.topic).filter(Boolean))].map((id) => pack.topics?.[id] ?? TOPICS[id] ?? id);
  if (topics.length) rows.push(staticRow("Topics", topics.join(", ")));
  if (pack.copiedFrom) rows.push(staticRow("Copied from", pack.copiedFrom.id));
  return rows;
}

// The pack's recorded voices (the starter's, a library pack's own, or the ones your AI recorded for a pack of yours): take
// turns, or keep one. A voice shows its credit and license when it has them, as Explore does.
function voicesGroup(id) {
  const voices = voice.packVoices(id);
  if (!voices.length) return null;
  const pinned = getStudySettings().listening.pins?.[id] ?? "";
  const choose = (slug) => setStudySetting(`listening.pins.${id}`, slug || null);
  // Who each voice is, its credit and license, a press away.
  const about = voices.filter((v) => v.about || v.credit || v.license).map((v) => `${v.name}: ${[v.about, v.credit, v.license].filter(Boolean).join(" · ")}`);
  return el(
    "div",
    { class: "lx-stack lx-pack-voices" },
    ui.pickList("Its voices", [
      ui.radioRow({ title: "Take turns", name: "pin", value: "", checked: !voices.some((v) => v.slug === pinned), onchange: choose }),
      ...voices.map((v) => ui.radioRow({ title: `Keep ${v.name}`, name: "pin", value: v.slug, checked: v.slug === pinned, onchange: choose })),
    ]),
    about.length ? el("ul", { part: "list" }, wordsRow("About its voices", ...about)) : null,
  );
}

// Its recordings being kept for offline (packs.js keepingNow): a row with their download's bar while they come, Tinta
// pouring in as the fill; once they're all here, it says so and stays, full, until you leave the page. `keep` is the
// page's own: { bar, title, sub, kept }, made when they start coming; this draws it, and keepingRow's update moves it on.
function keepingGroup(keep) {
  if (!keep) return null;
  return ui.group(null, [ui.listRow({ icon: keep.kept ? "check" : "cloud", title: keep.title, sub: [keep.sub, keep.bar] })]);
}

// The changes a pack of yours took on this device, newest first. Undo takes back the latest: on this device for one made here alone,
// here and on your other devices for one that went through the relay. It never says more than that.
const CHANGE_STATE = { applied: null, undone: "Undone", refused: "Not applied: it didn't pass the check here", missing: "Not applied: the pack wasn't here" };
function changesGroup(changes, onUndo, everywhere) {
  if (!changes.length) return null;
  return ui.namedGroup(
    "Changes",
    changes.slice(0, 12).map((change) =>
      ui.listRow({
        icon: change.state === "undone" ? "refresh" : change.mine ? "pencil" : "sparkle",
        title: `${change.who} ${change.said}`,
        sub: [day(change.at), CHANGE_STATE[change.state]].filter(Boolean).join(" · "),
        trailing: change.canUndo ? ui.button("Undo", { variant: "fade", size: "sm", onclick: () => onUndo(change) }) : undefined,
      }),
    ),
    everywhere ? "Undo takes back the latest change, here and on your other devices." : "Undo takes back the latest change on this device.",
  );
}

function sentencesGroup(pack) {
  const sentences = sentencesOf(pack);
  const rows = sentences.slice(0, SHOWN_SENTENCES).map((item) => {
    const row = ui.listRow({ title: sentence(item), sub: item.means });
    const title = row.querySelector(".lx-row-title");
    if (title) setLang(title, pack.language);
    return row;
  });
  const more = sentences.length - SHOWN_SENTENCES;
  return ui.namedGroup("Its sentences", rows, more > 0 ? `And ${more} more.` : null);
}

// Its plain cards: both sides, and a way into a session on them.
function cardsGroup(pack) {
  const cards = plainItems(pack);
  if (!cards.length) return null;
  const rows = cards.slice(0, SHOWN_SENTENCES).map((card) => {
    const row = ui.listRow({ title: card.text, sub: card.means });
    const title = row.querySelector(".lx-row-title");
    if (title) setLang(title, pack.language);
    return row;
  });
  const more = cards.length - SHOWN_SENTENCES;
  return ui.namedGroup("Its cards", rows, more > 0 ? `And ${more.toLocaleString()} more.` : null);
}

function studyDeck(pack) {
  if (!plainItems(pack).length) return null;
  const { due, fresh, total } = deckOverview(pack);
  return ui.group(null, [
    ui.listRow({
      title: "Study these cards",
      sub: deckLine({ due, fresh, total }),
      onclick: () => {
        if (learning() !== pack.language) setLearning(pack.language, pack.from && pack.from !== pack.language ? pack.from : fromFor(pack.language, speaks()));
        location.hash = `#study/session/deck/${encodeURIComponent(pack.id)}`;
      },
    }),
  ]);
}

export function packSettings(page, id, back = toPacks) {
  let title = "Pack";
  // The changes your AI made to it here (kept in IndexedDB, so read when the page opens and after each change).
  let changes = [];
  let reading = 0;
  const readChanges = () => {
    const mine = ++reading;
    packChanges(id).then((list) => {
      if (mine !== reading) return;
      // The same changes as drawn: the page stays as it is (drawn again, its flags were new pictures WebKit showed empty for a frame or two).
      if (JSON.stringify(list) === JSON.stringify(changes)) return;
      changes = list;
      draw();
    });
  };
  const undo = async (change) => {
    const result = await undoPackChange(change.id);
    lookToast(result.ok ? "right" : "wrong", result.ok ? `Undone: ${change.said}` : result.error);
  };
  // Its recordings coming for offline: made when they start, moved on in place (the page isn't drawn again for each
  // clip), and kept for the page's life once they're all here.
  let keep = null;
  const keepWords = (now) => (now.done ? ["Its recordings are kept on this device", "They play with no connection."] : ["Keeping its recordings for offline…", `${now.have} of ${now.total}. In the background; nothing waits for it.`]);
  const follow = (now) => {
    if (!now) return;
    // A new run after one that finished (clips gone from the device, a voice added) gets a bar of its own.
    const fresh = !keep || (keep.kept && !now.done && !now.stopped);
    if (fresh && (now.done || now.stopped)) return;
    if (fresh) keep = { bar: ui.downloadBar({ label: "Its recordings, for offline" }), title: el("span", {}), sub: el("span", {}), kept: false };
    if (now.stopped) {
      keep.bar.stop();
      keep = null;
      return draw();
    }
    const [title, sub] = keepWords(now);
    keep.title.textContent = title;
    keep.sub.textContent = sub;
    if (now.done) {
      keep.bar.done();
      keep.kept = true;
    } else keep.bar.set(now.have / Math.max(1, now.total));
    if (fresh || now.done) draw();
  };
  const draw = () => {
    const info = packInfo(id);
    if (!info) {
      title = "Not here";
      page.replaceChildren(ui.pageTitle("Not here"), el("p", { class: "lx-muted" }, "That pack isn't on this device. It may have been deleted, or not arrived yet."));
      return;
    }
    const { pack, kind, on, version } = info;
    title = pack.name;
    const actions = packActions(pack, { kind, on, version });
    show(
      page,
      ui.pageTitle(pack.name, firstSentence(pack.about)),
      ui.group(null, [
        ui.switchRow({
          title: "Study with it",
          checked: on,
          onchange: (checked) => setPackOn(id, checked),
        }),
      ]),
      studyDeck(pack),
      kind === "yours" ? ui.group(null, [ui.listRow({ title: "Edit its items", href: `#settings/study/packs/${encodeURIComponent(id)}/edit` })]) : null,
      voicesGroup(id),
      keepingGroup(keep),
      actions.length ? ui.group(null, actions.map((action) => ui.listRow({ title: action.label, sub: action.sub, opens: action.opens, onclick: () => action.run() }))) : null,
      el("section", { class: "lx-group" }, el("details", { class: "lx-settings-fold" }, el("summary", { part: "list-row" }, el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, "About it")), icon("chevron")), el("ul", { part: "list" }, aboutRows(info)))),
      kind === "yours" ? changesGroup(changes, undo, packOnAccount(id)) : null,
      sentencesOf(pack).length || !plainItems(pack).length ? sentencesGroup(pack) : null,
      cardsGroup(pack),
      kind === "yours"
        ? ui.group(null, [
            twoStepRow({
              variant: "danger",
              title: "Delete this pack",
              sub: "From every device. What you've learned from it stays.",
              confirm: "Press again to delete it",
              action: async () => {
                const { everywhere } = await deletePackEverywhere(id);
                if (!everywhere) lookToast("wrong", "Deleted here. Lexicommons couldn't be reached, so your other devices keep it.");
                location.hash = "#study/packs";
              },
            }),
          ])
        : null,
    );
  };
  readChanges();
  follow(keepingNow(id));
  const dispose = live(draw, voice.onVoicesChange, () => onPacksChange(readChanges), () => onKeptChange((entry) => entry.packId === id && readChanges()), () => onKeeping((packId, now) => packId === id && follow(now)));
  return { title, back, dispose };
}
