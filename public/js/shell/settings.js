// Settings: a menu, and a page for each part of it (some with pages of their own):
//   #settings                        the menu
//   #settings/account                name, ways to sign in (passkeys, Google, GitHub), sign out
//   #settings/appearance[/<page>]    animations, the theme (built-in or yours), text and layout; then the theme in
//                                    use's colors · css · images · ai; themes (yours, import, recent looks) and
//                                    themes/<id> (one of yours); flags (every flag's theme). (#settings/appearance/customize, the old single page,
//                                    opens the menu; #settings/appearance/share opens themes.)
//   #settings/study[/<way>]          practice, the quick session, remembering, the games and each one's own settings, resetting them
//                                    (#settings/study/say, Say it's page before 6 Nov, opens Speaking)
//   #settings/voice                  Sound and speech: voices, speaking (Say it's options too), sound effects, saying the words you tap
//   #settings/downloads              what's downloaded on this device, each with its size and Remove (settings-downloads.js)
//   #settings/translate              the full translator on this device, a language at a time (no longer linked: Downloads has it)
//   #settings/study/packs/<id>       a pack's page (settings-packs.js); the list is Study's (#study/packs), and its old address opens it
//   #settings/streak                 your streak, how it counts, and pausing it (settings-streak.js), from Home's streak
//   #settings/install[/<id>]         Add to Home Screen: this device's steps, or any device's (settings-install.js), from About
//   #settings/reminders              reminders on this device: each kind, the time, quiet hours (settings-reminders.js)
//   #settings/admin                  an admin's: the sample learner, the first run, the sound test, the design system
//   #settings/report                 Report a bug: what happened, a screenshot, and what goes along, shown (settings-report.js)
//   #settings/language · ai · storage (Sync across devices) · data · about
// Every value from the server goes in as text, never as HTML.

import { startRegistration } from "/vendor/simplewebauthn/index.js";
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { SIGN_IN_WAYS } from "../lx/brands.js";
import * as theme from "../lx/theme.js";
import { anyTokenEditor, colourEditor, cssEditor, flagPicker, imageEditor, importTheme, partsReference, recentLooks, sectionImageEditor, statusLine, themeDetails, themeList, themePicker, typeAndShapeEditor } from "../lx/appearance.js";
import { lookToast } from "./look-watch.js";
import { getSyncStatus, onSyncStatus, sourceLabel, syncNow } from "../lx/look-sync.js";
import { ITEMS } from "../study/content.js";
import { allEvidence, clearedProgress, clearProgress, UNDO_CLEAR_DAYS, undoClear } from "../study/progress.js";
import { clearPacks, packsOff, yourPacks } from "../study/packs.js";
import { clearPractices, listPractices } from "../practice/store.js";
import { bringBackTexts, clearReading, deleteTextsEverywhere, readingExport, TEXTS_BACK_DAYS, textsToBringBack } from "../read/store.js";
import { clearRemovedTexts } from "../read/text-inbox.js";
import { bankExport, clearBanks } from "../read/bank.js";
import { streakExport, streakNow } from "../study/done.js";
import { streakSettings } from "./settings-streak.js";
import { emailPage, emailRows } from "./settings-email.js";
import { installAboutRow, installSettings, thisDevice } from "./settings-install.js";
import { GAMES, planSession } from "../study/plan.js";
import { LENGTHS, WAYS, getStudySettings, resetStudySettings, setStudySetting } from "../study/settings.js";
import { cardItem } from "../study/session.js";
import { targetOf } from "../study/new-words.js";
import { currentVoiceName } from "../study/voice.js";
import { aiConnected, setThirdTab, thirdTab } from "./layout.js";
import { engineName, speakingSettings, voicesSettings } from "./settings-voice.js";
import { setSoundEffects } from "../lx/sound.js";
import { translateSettings } from "./settings-translate.js";
import { t } from "../lx/i18n.js";
import { themeLabel } from "../lx/theme-names.js";
import { replaceRoute } from "./route.js";
import { reportPage } from "./settings-report.js";
import { downloadsPage } from "./settings-downloads.js";
import { languageSettings, packSettings, packsSettings, packsSummary } from "./settings-packs.js";
import { packEditSettings } from "./settings-pack-edit.js";
import { featureFlagsPage } from "./settings-flags.js";
import { picturesPage } from "./settings-pictures.js";
import { learnerView, mayShare, setLearnerView, sharingOpen } from "./sharing.js";
import { learning, learningFromName, learningName } from "../study/learning.js";
import { connect, disconnect, isConnected, knownProviders, listFiles, PROVIDERS, readFile, signInEnded, writeFile } from "/js/storage.js";
import * as sync from "/js/sync.js";
import { api, del, forgetMe, post, whoAmI } from "./api.js";
import { forgetKeys } from "../ai/own-key.js";
import { askAnywhereOn, setAskAnywhere } from "../ai/ask.js";
import { remindersSettings } from "./settings-reminders.js";
import { pushSupport } from "../push.js";
import { openWelcome } from "./welcome.js";
import { readSample, sampleOn } from "../study/sample-mode.js";
import { newVersionReady, onNewVersionReady, reloadIntoNewVersion, runningVersion } from "./new-version.js";
import { SAMPLE_PRESETS } from "../study/sample-learner.js";

/** The version running: what the page's own script was asked for. */
const appVersion = () => {
  const v = runningVersion();
  return v ? `v${v}` : "This copy";
};

export const when = (ms) => (ms ? new Date(ms < 1e12 ? ms * 1000 : ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");
export const bytes = (n) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function message() {
  const node = el("p", { class: "lx-small lx-settings-message", role: "status" });
  node.say = (text, meaning) => {
    node.replaceChildren(meaning ? icon(meaning === "wrong" ? "cross" : "check") : "", text);
    node.setAttribute("data-tone", meaning ?? "");
  };
  return node;
}

export function copyButton(text) {
  const b = ui.button("Copy", {
    size: "sm",
    icon: "copy",
    onclick: async () => {
      await navigator.clipboard.writeText(text());
      b.lastChild.textContent = "Copied";
      setTimeout(() => (b.lastChild.textContent = "Copy"), 1400);
    },
  });
  return b;
}

/** A row that does something destructive: the first press asks, a second within a few seconds does it. */
export function twoStepRow({ icon: iconName, title, sub, confirm, action, variant }) {
  let armed = null;
  let row = null;
  const item = ui.listRow({
    icon: iconName,
    title,
    sub,
    variant,
    trailing: el("span"),
    onclick: async () => {
      const titleNode = row.querySelector(".lx-row-title");
      if (!armed) {
        titleNode.textContent = confirm;
        row.setAttribute("data-armed", "");
        armed = setTimeout(() => {
          armed = null;
          titleNode.textContent = title;
          row.removeAttribute("data-armed");
        }, 5000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      titleNode.textContent = title;
      row.removeAttribute("data-armed");
      await action();
    },
  });
  row = item.querySelector('[data-part="list-row"]');
  return item;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = el("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A row that opens a sheet of words: what a page has to say, out of the way until it's wanted. */
export function wordsRow(title, ...words) {
  return ui.listRow({
    title,
    opens: "sheet",
    onclick: () => {
      const sheet = ui.sheetLayer({ label: title });
      sheet.lxBody.append(el("div", { class: "lx-stack lx-sheet-words" }, el("h2", { class: "lx-sheet-title" }, title), ...words.map((text) => el("p", {}, text))));
      sheet.lxOpen();
    },
  });
}

/** An empty state with its drawing, where this device has it: Tinta in its pose until then, and if it never comes. */
export function drawnEmpty(id, words, pose) {
  const state = ui.emptyState(words, { pose });
  import("../study/pictures.js")
    .then(async ({ loadPictures, pictureNode }) => {
      const tinta = state.querySelector('[data-part="character"]');
      if (tinta && (await loadPictures([id]))) ui.arrive(tinta, el("span", { class: "lx-empty-picture" }, pictureNode(id)));
    })
    .catch(() => {});
  return state;
}

/** The same as a list of its own, on a page with no list there. */
const wordsList = (title, ...words) => el("ul", { part: "list" }, wordsRow(title, ...words));

export const emptyRow = (text) => el("li", { part: "list-row", class: "lx-row-empty" }, el("span", { class: "lx-row-text lx-muted" }, text));
// A group named as a choice is (its words over what's in it, no heading): see ui.namedGroup.
export const labelled = (label, ...children) => el("section", { class: "lx-group", "aria-label": label }, el("p", { class: "lx-choice-title" }, label), ...children);

// ---------- the menu ----------

// The menu as last drawn, by what it shows: drawn again with nothing changed (Settings' tab come back to), it stays as it is. Built again, every
// row was a new node, and WebKit drew the language's new flag empty for a frame or two (7 Nov 2026).
const drawnMenu = new WeakMap(); // page → key
function menu(page, ctx) {
  // A ready-made theme by the name it stands alone by ("Japan's flag": lx/theme-names.js).
  const inUseNow = theme.themeInUse();
  const themeName = inUseNow.kind === "built-in" ? themeLabel(inUseNow.id, inUseNow.name) : inUseNow.name;
  const view = {
    title: "Settings",
    // Back to the tab you came from (tab: a wide screen's sidebar has every tab and Settings, so it hides this pill there: shell.css).
    get back() {
      return { href: ctx.lastTab, label: ctx.lastTabName, tab: true };
    },
    refresh: () => menu(page, ctx),
  };
  const key = JSON.stringify([ctx.me.user.name, learning(), learningName(), pushSupport().on, themeName, knownProviders().length ? Object.keys(PROVIDERS).filter((id) => isConnected(id)) : null, document.documentElement.lang]);
  if (drawnMenu.get(page) === key && page.childElementCount) return view;
  drawnMenu.set(page, key);
  const adminGroup = ui.group(null, [
    ui.listRow({ symbol: "info-q", icon: "info", title: "About", href: "#settings/about" }),
    // Something went wrong: written here, with what goes along shown first (shell/settings-report.js).
    ui.listRow({ symbol: "bug-q", icon: "help", title: t("settings.report.title"), href: "#settings/report" }),
  ]);
  page.replaceChildren(
    ui.pageTitle("Settings"),
    el("ul", { part: "list", class: "lx-settings-you" }, el("li", { class: "lx-row-item" }, el("a", { part: "list-row", href: "#settings/account", class: "lx-profile-row" }, ui.avatar(ctx.me.user.name), el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, ctx.me.user.name)), icon("chevron")))),
    // The root (6 Nov audit): what you're learning; how you study; how it looks; what's on this phone and yours; About, and Admin for an
    // admin. Grouped by space, no headings. Packs live on Study, Translate's download in Downloads, Add to Home Screen in About.
    ui.group(null, [ui.listRow({ symbol: "globe-q", icon: "globe", title: "Language", value: [ui.languageFlag(learning()), learningName()], href: "#settings/language" })]),
    ui.group(null, [
      ui.listRow({ symbol: "tabs2-study-a", icon: "cards", title: "Study", href: "#settings/study" }),
      ui.listRow({ symbol: "speaker", icon: "speaker", title: "Sound and speech", href: "#settings/voice" }),
      ui.listRow({ symbol: "bell-q", icon: "clock", title: "Reminders", value: pushSupport().on ? "On" : "Off", href: "#settings/reminders" }),
    ]),
    ui.group(null, [ui.listRow({ symbol: "palette-q", icon: "palette", title: "Appearance", value: themeName, href: "#settings/appearance" })]),
    ui.group(null, [
      ui.listRow({ symbol: "download-q", icon: "download", title: t("settings.downloads.title"), href: "#settings/downloads" }),
      ...(knownProviders().length ? [storageRow()] : []),
      ui.listRow({ symbol: "ai-q", icon: "plug", title: "AI", href: "#ai" }),
      ui.listRow({ symbol: "data-q", icon: "download", title: "Your data", href: "#settings/data" }),
    ]),
    adminGroup,
  );
  // Admin, for an admin only (their own section: the sample learner, the first run, the sound test, the design system).
  whoAmI()
    .then((me) => {
      if (me?.roles?.includes("admin") && adminGroup.isConnected) adminGroup.querySelector("ul")?.append(ui.listRow({ symbol: "key-q", icon: "key", title: "Admin", href: "#settings/admin" }));
    })
    .catch(() => {});
  // The tab's own page is kept while you're elsewhere (main.js): what its rows say is read again when it's shown, and drawn again if it changed.
  return view;
}

// The streak in Study's list: its days, or that it's paused.
function streakValue() {
  const s = streakNow();
  return s.state === "paused" ? "Paused" : s.days === 1 ? "1 day" : `${s.days} days`;
}

// ---------- Sound and speech ----------

function voiceMenu(page) {
  const s = getStudySettings();
  page.replaceChildren(
    ui.pageTitle("Sound and speech"),
    ui.group(null, [
      ui.listRow({ title: "Voices", value: currentVoiceName() ?? "None here", href: "#settings/study/voices" }),
      ui.listRow({ title: "Speaking", value: engineName(), href: "#settings/study/speaking" }),
      ui.switchRow({ title: "Sound effects", checked: s.sound?.effects !== false, onchange: (on) => setSoundEffects(on) }),
      ui.switchRow({ title: "Say the words you tap", checked: s.listening.tapWords, onchange: (on) => setStudySetting("listening.tapWords", on) }),
    ]),
  );
  return { title: "Sound and speech" };
}

// ---------- Account ----------

const STORE_SHORT = { google: "Drive", dropbox: "Dropbox", onedrive: "OneDrive" };
/** Settings' Storage row, naming the stores this site offers. */
const storageRow = () => {
  const on = Object.keys(PROVIDERS).filter((id) => isConnected(id));
  // Your progress, packs and texts are with your account wherever the site keeps its copy (sync.js ACCOUNT_STORE); a storage of your own carries the rest.
  const account = sync.syncTargets().some((t) => t.id === sync.ACCOUNT_STORE);
  return ui.listRow({ symbol: "cloud-q", icon: "cloud", title: "Sync across devices", value: [account ? "Your account" : null, ...on.map((id) => STORE_SHORT[id])].filter(Boolean).join(", ") || "Off", href: "#settings/storage" });
};

const PROVIDER_NAMES = { google: "Google", github: "GitHub", apple: "Apple" };

// What the server says after adding Google or GitHub here (/login/<provider>/callback → #settings/account?signin=…).
const SIGNIN_RESULTS = {
  added: [(n) => `${n} added. You can sign in with it now.`, "right"],
  already: [(n) => `That ${n} account is already one of your ways to sign in.`, "right"],
  taken: [(n) => `That ${n} account signs in to another Lexicommons account, so it can't be added here. Remove it there first.`, "wrong"],
  cancelled: [(n) => `You canceled adding ${n}.`, "wrong"],
  expired: [() => "That took too long, or was started in another tab. Try again.", "wrong"],
  provider: [(n) => `${n} didn't answer as expected. Try again.`, "wrong"],
  unavailable: [(n) => `Adding ${n} isn't available right now.`, "wrong"],
  busy: [() => "Too many attempts. Wait a minute, then try again.", "wrong"],
  "signed-out": [() => "You were signed out partway. Try again.", "wrong"],
};

/** A brand's mark (Google's G, GitHub's mark) as a row icon. Fixed markup from brands.js, never server text. */
function wayMark(way) {
  const holder = el("span", { class: "lx-row-icon lx-sign-in-mark" });
  holder.innerHTML = SIGN_IN_WAYS[way].mark;
  return holder;
}

/** A Remove button that asks first: the first press arms it, a second within five seconds removes. */
function removeButton(what, action) {
  let armed = null;
  const button = ui.button("Remove", {
    variant: "fade",
    size: "sm",
    onclick: async () => {
      if (!armed) {
        button.textContent = "Press to remove";
        button.setAttribute("aria-label", `Press again to remove ${what}`);
        armed = setTimeout(() => {
          armed = null;
          button.textContent = "Remove";
          button.removeAttribute("aria-label");
        }, 5000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      await action();
    },
  });
  button.setAttribute("aria-label", `Remove ${what}`);
  return button;
}

/** Leaves for Google or GitHub to add it to this account (a form post, as on the sign-in page). */
function addProvider(provider) {
  const form = el(
    "form",
    { method: "post", action: `/login/${provider}`, hidden: true },
    el("input", { type: "hidden", name: "intent", value: "link" }),
    el("input", { type: "hidden", name: "next", value: "/app/#settings/account" }),
  );
  document.body.append(form);
  form.submit();
}

const listOfWays = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

function account(page, ctx, params = {}) {
  const msg = message();
  const youName = el("span", { class: "lx-row-title" }, ctx.me.user.name);
  const youAvatar = el("span", { class: "lx-you-avatar" }, ui.avatar(ctx.me.user.name, { size: "lg" }));
  // Your name: a press away, in a sheet, because it's rarely changed.
  const changeName = () => {
    const field = el("input", { part: "text-field", value: youName.textContent, maxlength: 40, "aria-label": "Your name", autocomplete: "nickname" });
    const sheet = ui.sheetLayer({ label: "Your name" });
    const said = message();
    const save = ui.button("Save", {
      variant: "go",
      block: true,
      onclick: async () => {
        try {
          const { user } = await post("/api/me", { name: field.value });
          ctx.setUser(user);
          youName.textContent = user.name;
          youAvatar.replaceChildren(ui.avatar(user.name, { size: "lg" }));
          sheet.lxClose();
          msg.say("Name saved", "right");
        } catch (error) {
          said.say(error.message, "wrong");
        }
      },
    });
    sheet.lxBody.append(el("div", { class: "lx-stack" }, el("h2", { class: "lx-sheet-title" }, "Your name"), field, el("p", { class: "lx-small lx-muted" }, mayShare() ? "Shown on anything you share." : "Only you see it, on your account."), said, save));
    sheet.lxOpen();
  };

  const list = el("ul", { part: "list" });
  const note = el("p", { part: "group-note" });
  const render = (me) => {
    const passkeys = me.passkeys ?? [];
    const signins = me.signins ?? [];
    const ready = me.providers ?? {};
    const count = passkeys.length + signins.length;
    const remove = (what, path) =>
      removeButton(what, async () => {
        try {
          await del(path);
          render(await api("/api/me"));
          msg.say(`${what[0].toUpperCase()}${what.slice(1)} removed`, "right");
        } catch (error) {
          msg.say(error.message, "wrong");
        }
      });
    list.replaceChildren(
      ...passkeys.map((p) =>
        ui.listRow({
          title: p.synced ? "Synced passkey" : "Passkey on one device",
          sub: `Last used ${when(p.lastUsedAt)}`,
          trailing: count > 1 ? remove("this passkey", `/api/auth/ways/passkey/${encodeURIComponent(p.id)}`) : undefined,
        }),
      ),
      ...signins.map((s) =>
        el(
          "li",
          { part: "list-row" },
          wayMark(s.provider),
          el(
            "span",
            { class: "lx-row-text" },
            el("span", { class: "lx-row-title" }, PROVIDER_NAMES[s.provider] ?? s.provider),
            el("span", { class: "lx-row-sub" }, s.label || `Last used ${when(s.lastUsedAt)}`),
          ),
          count > 1 ? remove(PROVIDER_NAMES[s.provider] ?? "this sign-in", `/api/auth/ways/${s.provider}/${encodeURIComponent(s.subject)}`) : null,
        ),
      ),
      ui.listRow({
        title: "Add a passkey on this device",
        trailing: el("span"),
        onclick: async () => {
          try {
            const options = await post("/api/auth/passkeys/options");
            const response = await startRegistration({ optionsJSON: options });
            await post("/api/auth/passkeys/verify", response);
            render(await api("/api/me"));
            msg.say("Passkey added", "right");
          } catch (error) {
            msg.say(error?.name === "InvalidStateError" ? "This device already has a passkey for your account." : error?.name === "NotAllowedError" ? "The passkey prompt was closed before it finished." : error.message, "wrong");
          }
        },
      }),
      ...["google", "github", "apple"]
        .filter((p) => ready[p] && !signins.some((s) => s.provider === p))
        .map((p) => {
          const item = ui.listRow({ title: `Add ${PROVIDER_NAMES[p]}`, trailing: el("span"), onclick: () => addProvider(p) });
          item.querySelector('[data-part="list-row"]').prepend(wayMark(p));
          return item;
        }),
    );
    note.textContent = count <= 1 ? "This is your only way to sign in. Add another, so you can still get in if you lose this one." : "";
    note.hidden = count > 1;
    note.toggleAttribute("data-nudge", count <= 1);
  };
  render(ctx.me);

  const result = SIGNIN_RESULTS[params.signin];
  if (result) {
    const [words, meaning] = result;
    msg.say(words(PROVIDER_NAMES[params.with] ?? "That account"), meaning);
    // Said once: a reload or Back doesn't say it again.
    history.replaceState(history.state, "", "#settings/account");
  }

  page.replaceChildren(
    ui.pageTitle("Account"),
    el("ul", { part: "list", class: "lx-settings-you" }, el("li", { class: "lx-row-item" }, el("button", { part: "list-row", type: "button", class: "lx-profile-row", "aria-label": "Change your name", "aria-haspopup": "dialog", "data-opens": "sheet", onclick: changeName }, youAvatar, el("span", { class: "lx-row-text" }, youName)))),
    // The ways to sign in: their rows say what they are, so no heading (a screen reader is told).
    el("section", { class: "lx-group lx-ways", "aria-label": "Ways to sign in" }, list, note, msg),
    ...emailRows(ctx.me),
    ui.group(null, [
      ui.listRow({
        title: "Sign out",
        trailing: el("span"),
        onclick: async () => {
          // A key of your own for the in-app AI goes with you (ai/own-key.js): it's never left on a device you've signed out of.
          await forgetKeys().catch(() => {});
          await post("/api/auth/logout");
          // Signed out: an offline start no longer starts as you (api.js whoAmI).
          forgetMe();
          location.assign("/login?signedout=1");
        },
      }),
    ]),
    deleteAccountGroup(msg),
  );
  return { title: "Account" };
}

// ---------- Appearance ----------

function appearance(page) {
  const s = theme.getSettings();
  const status = statusLine();
  // Tinta by the Theme label: a new theme spreads from under it as it shakes itself (themePicker).
  const tinta = ui.character({ size: 48, hidden: true });
  const picker = themePicker({ say: status.say, tinta });
  const choice = (name) => ui.choiceRow({ title: theme.PRESETS[name].label, options: theme.PRESETS[name].options, value: s.presets[name], onchange: (value) => theme.setPreset(name, value) });
  page.replaceChildren(
    ui.pageTitle("Appearance"),
    el("section", { class: "lx-group lx-theme-group" }, el("div", { class: "lx-theme-head" }, el("h2", { part: "group-label" }, "Theme"), tinta), picker.node),
    status,
    // Text size, drawings and animations right under the built-in themes, in reach; then the ready-made themes; Make it yours and Layout at the foot.
    ui.group(null, [choice("text"), choice("art"), choice("motion")]),
    picker.more,
    ui.group(null, [ui.listRow({ title: "Make it yours", href: "#settings/appearance/edit" }), ui.listRow({ title: "Layout", href: "#settings/appearance/layout" })]),
  );
  return { title: "Appearance", dispose: () => picker.dispose() };
}

// Every flag's theme (Appearance's All flags row): the whole grid at once, back to Appearance.
function flagsPage(page) {
  const status = statusLine();
  const picker = flagPicker({ say: status.say });
  page.replaceChildren(ui.pageTitle(t("settings.appearance.flagsTitle"), t("settings.appearance.flagsSub")), status, picker.node);
  return { title: t("settings.appearance.flagsTitle"), back: toAppearance, dispose: () => picker.dispose() };
}

// Density, cards, the reader and the third tab: what few people change.
function layoutPage(page) {
  const s = theme.getSettings();
  const choice = (name, sub) => ui.choiceRow({ title: theme.PRESETS[name].label, sub, options: theme.PRESETS[name].options, value: s.presets[name], onchange: (value) => theme.setPreset(name, value) });
  page.replaceChildren(
    ui.pageTitle("Layout"),
    ui.group(null, [
      choice("density"),
      choice("card"),
      choice("reader", "How long texts open"),
      // A choice only once an AI is connected: with none, What you know has the tab (layout.js).
      ...(aiConnected()
        ? [
            ui.switchRow({
              title: "AI in the tab bar",
              sub: "Otherwise it's a row on Home",
              checked: thirdTab() === "ai",
              onchange: (on) => setThirdTab(on ? "ai" : "none"),
            }),
            ui.switchRow({
              icon: "chat",
              title: "Ask from anywhere",
              sub: "A … beside an answer, a word or an idea, to ask your AI about it",
              checked: askAnywhereOn(),
              onchange: (on) => setAskAnywhere(on),
            }),
          ]
        : []),
    ]),
  );
  return { title: "Layout", back: toAppearance };
}

// Making a look your own: what you can change in the theme in use, and every look you've kept.
function editPage(page) {
  const inUse = el("section", { class: "lx-group" });
  const renderInUse = (now) => {
    const current = theme.themeInUse();
    const colours = Object.keys(now.look.tokens).filter((name) => !/^--m-(right|wrong|slipping)-(bg|edge)$/.test(name)).length;
    // The sections' own backgrounds count as one entry: "Background, Logo, 6 sections".
    const isSection = (slot) => slot.startsWith("background-") && slot.slice("background-".length) in theme.SECTIONS;
    const named = (slot) => (slot === "background" ? "Background" : slot === "mark" ? "Logo" : slot);
    const slots = Object.keys(now.look.images);
    const sectionCount = slots.filter(isSection).length;
    const images = [...slots.filter((slot) => !isSection(slot)).map(named), ...(sectionCount ? [`${sectionCount} section${sectionCount === 1 ? "" : "s"}`] : [])];
    const yours = current.kind === "yours";
    const count = theme.themes().length;
    inUse.replaceChildren(
      el(
        "ul",
        { part: "list" },
        ui.listRow({ title: "Colors", value: colours ? `${colours} changed` : "Theme's own", href: "#settings/appearance/colors" }),
        ui.listRow({ title: "Images", value: images.length ? images.join(", ") : "None", href: "#settings/appearance/images" }),
        ui.listRow({ title: "Custom CSS", value: now.look.css ? bytes(new TextEncoder().encode(now.look.css).length) : "None", href: "#settings/appearance/css" }),
        ...(yours ? [ui.listRow({ title: "Name, duplicate, share", href: `#settings/appearance/themes/${current.id}` })] : []),
      ),
      el("p", { part: "group-note" }, yours ? `Changes save to ${current.name}, and your other devices follow.` : `Changing anything starts a new theme of yours from ${current.name}.`),
      el(
        "ul",
        { part: "list", class: "lx-edit-more" },
        ui.listRow({ title: "Your themes", value: count ? String(count) : "None yet", href: "#settings/appearance/themes" }),
        // The way out of a broken look, behind its row (an explanation, not a note: docs/design-bible.md).
        wordsRow("If a look breaks the app", `Open ${location.host}/app/?safe to turn the look off while you fix it.`),
      ),
    );
  };
  renderInUse(theme.getSettings());
  page.replaceChildren(ui.pageTitle("Make it yours"), inUse);
  return { title: "Make it yours", back: toAppearance, dispose: theme.onChange((next) => renderInUse(next)) };
}

// Your themes: each one's page, importing a theme file, and recent looks on this device.
function themesPage(page) {
  const status = statusLine();
  const list = themeList({ href: (id) => `#settings/appearance/themes/${id}` });
  const importer = importTheme({ say: status.say });
  const recent = recentLooks({ say: status.say });
  page.replaceChildren(
    ui.pageTitle("Your themes"),
    status,
    el("section", { class: "lx-group" }, list.node),
    // Its one button says what it does: no name over it.
    el("section", { class: "lx-group" }, importer.node),
    labelled("Recent looks", recent.node),
  );
  return { title: "Your themes", back: toEdit, dispose: disposeAll(list, recent) };
}

// One of your themes.
function themePage(page, id) {
  const status = statusLine();
  const toThemes = { href: "#settings/appearance/themes", label: "Your themes" };
  const details = themeDetails({
    id,
    say: status.say,
    href: (sub) => `#settings/appearance/${sub}`,
    onDuplicated: (copy) => {
      location.hash = `#settings/appearance/themes/${copy}`;
      lookToast("right", `Made ${theme.savedTheme(copy)?.name ?? "a copy"}`);
    },
    onDeleted: ({ name, undo }) => {
      location.hash = "#settings/appearance/themes";
      lookToast("right", `Deleted ${name}`, { undo });
    },
  });
  if (!details) {
    page.replaceChildren(ui.pageTitle("Not here"), el("p", { class: "lx-muted" }, "That theme isn't on this device. It may have been deleted, or not arrived yet."));
    return { title: "Theme", back: toThemes };
  }
  page.replaceChildren(ui.pageTitle(details.title), status, details.node);
  const title = page.querySelector('[data-part="page-title"]');
  const stop = theme.onChange(() => {
    const entry = theme.savedTheme(id);
    if (entry) title.textContent = entry.name;
  });
  return { title: details.title, back: toThemes, dispose: disposeAll(details, { dispose: stop }) };
}

const toAppearance = { href: "#settings/appearance", label: "Appearance" };
const toEdit = { href: "#settings/appearance/edit", label: "Make it yours" };
// Spread into a page's children: nothing outside safe mode.
const safeNote = () => (theme.SAFE_MODE ? [ui.feedback("slipping", "Safe mode", "Your look is saved but not shown here. Leave safe mode to see it.")] : []);
const disposeAll = (...editors) => () => editors.forEach((e) => e.dispose());
/** Where an editor's changes go: the theme in use, or a new theme of yours if it's a built-in one. */
const savesTo = () => {
  const current = theme.themeInUse();
  return current.kind === "yours" ? `Saves to ${current.name}.` : `Starts a new theme of yours from ${themeLabel(current.id, current.name)}.`;
};

function colours(page) {
  const status = statusLine();
  const editor = colourEditor({ say: status.say });
  const type = typeAndShapeEditor({ say: status.say });
  page.replaceChildren(ui.pageTitle("Colors", savesTo()), ...safeNote(), status, editor.node, type.node);
  return { title: "Colors", back: toEdit, dispose: disposeAll(editor, type) };
}

function customCss(page) {
  const status = statusLine();
  const editor = cssEditor({ say: status.say });
  const tokens = anyTokenEditor({ say: status.say });
  page.replaceChildren(
    ui.pageTitle("Custom CSS", savesTo()),
    ...safeNote(),
    editor.node,
    status,
    partsReference(editor),
    wordsList("How your CSS works", "Your CSS always wins over the app's, so plain selectors work.", "Outside links and @import are removed, so a look can't reach another server. Use your images from Images as var(--image-name). CSS that hides the app is undone at once."),
    tokens.node,
  );
  return { title: "Custom CSS", back: toEdit, dispose: disposeAll(editor, tokens) };
}

function images(page) {
  const status = statusLine();
  const editor = imageEditor({ say: status.say, sectionHref: (id) => `#settings/appearance/images/${id}` });
  page.replaceChildren(ui.pageTitle("Images", savesTo()), ...safeNote(), status, editor.node);
  return { title: "Images", back: toEdit, dispose: editor.dispose };
}

// One section's own background. Its background shows behind the page while it's open (main.js puts the page's own
// back when you leave).
function sectionImages(page, id) {
  const status = statusLine();
  const editor = sectionImageEditor({ say: status.say, section: id });
  page.replaceChildren(ui.pageTitle(editor.title), ...safeNote(), status, editor.node);
  return { title: editor.title, back: { href: "#settings/appearance/images", label: "Images" }, dispose: editor.dispose };
}

const ask = () => [
  "Make my Lexicommons look like Delft pottery: white, cobalt blue, and a tile pattern behind everything.",
  `Give the study cards rounder corners, and use a serif for the ${learningName()} sentence.`,
  `Make moved words stand out more on the ${learningName()}-order line, without relying on color.`,
  "Use this photo as my background and pick colors that go with it.",
];

function askAi(page) {
  const state = el("ul", { part: "list" });
  const renderState = async () => {
    const sync = getSyncStatus();
    let look = null;
    try {
      look = sync.ok ? await api("/api/look") : null;
    } catch {}
    state.replaceChildren(
      ui.listRow({
        icon: sync.ok ? "check" : "cross",
        title: sync.ok ? "This device is in step" : "Not in step right now",
        sub: sync.ok
          ? look?.rev
            ? `Revision ${look.rev}, last changed by ${look.source === "device" ? "a device" : sourceLabel(look.source)}, ${when(look.updatedAt)}`
            : "No changes yet: your look is the theme as it comes"
          : `${sync.error ?? "No connection"}. It tries again every few seconds.`,
      }),
    );
  };
  renderState();
  const stop = onSyncStatus(() => renderState());
  syncNow();
  const prompt = (text) => el("li", { class: "lx-row-item" }, el("div", { part: "list-row" }, el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, text)), copyButton(() => text)));
  page.replaceChildren(
    ui.pageTitle("Ask your AI", "Your connected AI can read your look and change it: colors, fonts, shapes, CSS and images. Changes show up here within seconds, with Undo."),
    labelled("Things to ask", el("ul", { part: "list" }, ask().map(prompt))),
    labelled(
      "In Claude Code",
      el("div", { class: "lx-inline-form" }, el("code", { class: "lx-code" }, "/mcp__lexicommons__restyle"), copyButton(() => "/mcp__lexicommons__restyle")),
      el("p", { part: "group-note" }, "The restyle prompt: it asks for what you want, then reads how theming works and your current look before changing it. Any app connected to Lexicommons can do the same from a plain request."),
    ),
    labelled("Your look on your account", state, el("p", { part: "group-note" }, "Your themes, and which one is in use, are kept with your account so your AI can see them and every device you use follows. Ask for a new look and your AI makes it a new theme, so the ones you have stay as they are. Text size, density and animations stay on each device.")),
    ui.group(null, [ui.listRow({ icon: "plug", title: "Connect your AI", sub: "Claude, Codex, or any app that speaks MCP", href: "#ai/connect" })]),
  );
  return { title: "Ask your AI", back: toEdit, dispose: stop };
}

// ---------- Study ----------

function describeQuick(s) {
  const ways = Object.keys(WAYS).filter((w) => s.quick.include[w]).length;
  const all = Object.keys(WAYS).length;
  return `${LENGTHS[s.quick.length].label} · ${s.quick.newPerSession} new${ways === all ? "" : ` · ${ways} of ${all} ways`}`;
}

function studyMenu(page) {
  const s = getStudySettings();
  const msg = message();
  page.replaceChildren(
    ui.pageTitle("Study"),
    // The 6 Nov audit: Quick session's row went with its entry (More ways), Streak's page opens from Home's streak; resetting is this page's.
    ui.group(null, [
      ui.listRow({ title: "Practice", value: `${s.practice.minutes} min`, href: "#settings/study/practice" }),
      ui.listRow({ title: "Remembering", value: describeMemory(s), href: "#settings/study/memory" }),
      ui.listRow({ title: "Games", value: `${Object.keys(WAYS).filter((way) => s.quick.include[way]).length} of ${Object.keys(WAYS).length}`, href: "#settings/study/games" }),
    ]),
    ui.group(null, [
      twoStepRow({
        title: "Reset study settings",
        confirm: "Press again to reset them",
        action: async () => {
          resetStudySettings();
          msg.say("Study settings are back to the defaults", "right");
          studyMenu(page);
        },
      }),
    ]),
    msg,
  );
  return { title: "Study" };
}

// Each game's own settings. A row says only what's unusual: that the game is off.
function gamesMenu(page) {
  const s = getStudySettings();
  page.replaceChildren(
    ui.pageTitle("Games"),
    // Across the games, first (under twenty games it went unseen): a right answer's word-for-word line too (study/session.js finishStep), each
    // game's own switch still turning it off there.
    ui.group(null, [ui.switchRow({ title: t("settings.games.literalRight"), checked: s.right.literal, onchange: (on) => setStudySetting("right.literal", on) })]),
    ui.group(null, Object.keys(WAYS).map((way) => ui.listRow({ title: WAYS[way], value: s.quick.include[way] ? undefined : "Off", href: way === "say" ? "#settings/study/speaking?from=games" : `#settings/study/${way}` }))),
  );
  return { title: "Games", back: { href: "#settings/study", label: "Study" } };
}

const STRENGTHS = [
  ["read", "Reading", "Understand it written"],
  ["hear", "Hearing", "Understand it spoken"],
  ["say", "Saying", "Say or type it yourself"],
];
const TARGETS = [
  [0.85, "85%"],
  [0.9, "90%"],
  [0.95, "95%"],
];

function describeMemory(s) {
  const on = STRENGTHS.filter(([id]) => s.memory.train[id]).map(([, name]) => name.toLowerCase());
  const target = `${Math.round(s.memory.target * 100)}%`;
  return on.length === STRENGTHS.length ? target : `${on.join(", ").replace(/^./, (c) => c.toUpperCase())} · ${target}`;
}

function memorySettings(page, back) {
  const s = getStudySettings();
  const msg = message();
  // Each its name alone: what they mean is under How this works, on this page.
  const train = STRENGTHS.map(([id, title]) =>
    ui.switchRow({
      title,
      checked: s.memory.train[id],
      onchange: (checked, input) => {
        const now = getStudySettings().memory.train;
        if (!checked && !STRENGTHS.some(([other]) => other !== id && now[other])) {
          input.checked = true;
          msg.say("Train at least one of the three.", "wrong");
          return;
        }
        setStudySetting(`memory.train.${id}`, checked);
      },
    }),
  );
  page.replaceChildren(
    ui.pageTitle("Remembering"),
    // What you train: the choice's own name, as a choice's title (no heading over a group).
    el("section", { class: "lx-group", "aria-label": "What you train" }, el("p", { class: "lx-choice-title" }, "What you train"), el("ul", { part: "list" }, train)),
    ui.group(null, [
      ui.choiceRow({
        title: "Bring things back at",
        options: TARGETS,
        value: s.memory.target,
        onchange: (value) => setStudySetting("memory.target", value),
      }),
      wordsRow(
        "How this works",
        "Reading is understanding it written; hearing, understanding it spoken; saying, saying or typing it yourself.",
        "For everything you study, the app predicts how likely you are to recall it now, and brings it back before that drops below your target.",
        "Higher means more reviews and fresher memories; lower, fewer reviews. 90% is the usual.",
        "Something you don't train never comes up as due. What you do in it still counts: saying something right shows you can read it too.",
      ),
    ]),
    msg,
  );
  return { title: "Remembering", back };
}

function practiceSettings(page, back) {
  const s = getStudySettings();
  page.replaceChildren(
    ui.pageTitle("Practice"),
    ui.group(null, [
      ui.choiceRow({
        title: "About this long",
        options: [[3, "3 min"], [5, "5 min"], [10, "10 min"]],
        value: s.practice.minutes,
        onchange: (value) => setStudySetting("practice.minutes", value),
      }),
      ui.choiceRow({
        title: "Practices before a new lesson",
        options: [[2, "2"], [3, "3"], [5, "5"]],
        value: s.practice.suggestEvery,
        onchange: (value) => setStudySetting("practice.suggestEvery", value),
      }),
    ]),
  );
  return { title: "Practice", back };
}

function quickSettings(page, back) {
  const s = getStudySettings();
  const msg = message();
  const preview = el("div", { class: "lx-quick-preview" });
  const renderPreview = () => {
    const plan = planSession("quick");
    preview.replaceChildren(el("p", { class: "lx-small lx-muted", "data-steps": plan.steps.length }, plan.steps.length ? `Right now that's ${plan.steps.length} steps.` : plan.empty));
  };
  const include = Object.entries(WAYS).map(([way, label]) =>
    ui.switchRow({
      title: label,
      checked: s.quick.include[way],
      onchange: (checked, input) => {
        const now = getStudySettings().quick.include;
        if (!checked && !Object.entries(now).some(([w, on]) => on && w !== way)) {
          input.checked = true;
          msg.say("A quick session needs at least one way to study.", "wrong");
          return;
        }
        setStudySetting(`quick.include.${way}`, checked);
        renderPreview();
      },
    }),
  );
  page.replaceChildren(
    ui.pageTitle("Quick session"),
    ui.group(null, [
      ui.choiceRow({
        title: "How long",
        options: Object.entries(LENGTHS).map(([id, l]) => [id, l.label]),
        value: s.quick.length,
        onchange: (value) => (setStudySetting("quick.length", value), renderPreview()),
      }),
      ui.choiceRow({
        title: "New words",
        options: [[0, "None"], [1, "1"], [2, "2"], [3, "3"], [5, "5"]],
        value: s.quick.newPerSession,
        onchange: (value) => (setStudySetting("quick.newPerSession", value), renderPreview()),
      }),
    ]),
    preview,
    ui.namedGroup("Games it can use", include),
    msg,
    ui.group(null, [
      wordsRow(
        "What's in a quick session",
        "Sentences you just missed, then what's due, then new words, then what's weakest.",
        Object.values(LENGTHS).map((l) => `${l.label}: ${l.steps} steps, ${l.about}.`).join(" "),
        "Each new word is introduced, then comes back as a game later in the same session. For each sentence it picks a game that tests what's due, gentler while it's new, from the ones on here.",
      ),
    ]),
  );
  renderPreview();
  return { title: "Quick session", back };
}

function cardSettings(page, back) {
  const preview = el("div", { class: "lx-card-preview" });
  const renderPreview = () => {
    const c = getStudySettings().cards;
    const card = ui.studyCard(cardItem(ITEMS[0], { target: targetOf(ITEMS[0]) }), { reveal: "external", onWord: () => {}, literal: { show: c.literal, start: c.reveal, flip: c.flip, position: c.position, natural: c.natural } });
    preview.replaceChildren(card);
    requestAnimationFrame(() => card.lxReveal());
  };
  const s = getStudySettings();
  const set = (path) => (value) => (setStudySetting(path, value), renderPreview());
  page.replaceChildren(
    ui.pageTitle("Study cards"),
    preview,
    ui.namedGroup(
      `The ${learningName()}-order line`,
      [
        ui.switchRow({ title: `Show the ${learningName()}-order line`, checked: s.cards.literal, onchange: set("cards.literal") }),
        ui.choiceRow({ title: "When the meaning shows", options: [["slide", `Slides into ${learningName()} order`], ["dutch", `In ${learningName()} order`], ["english", `In ${learningFromName()} order`]], value: s.cards.reveal, onchange: set("cards.reveal") }),
        ui.switchRow({ title: "Order switch", checked: s.cards.flip, onchange: set("cards.flip") }),
        ui.choiceRow({ title: "Where it sits", options: [["below", "Below the sentence"], ["above", "Above it"]], value: s.cards.position, onchange: set("cards.position") }),
      ],
    ),
    ui.group(null, [ui.switchRow({ title: "Show natural English with the meaning", checked: s.cards.natural, onchange: set("cards.natural") }), ui.switchRow({ title: "Use in your day and quick sessions", checked: s.quick.include.cards, onchange: (value) => setStudySetting("quick.include.cards", value) })]),
  );
  renderPreview();
  return { title: "Study cards", back };
}

function gameSettings(page, way, back) {
  const s = getStudySettings();
  const set = (path) => (value) => setStudySetting(path, value);
  const hintRow = () => ui.switchRow({ title: `Offer the ${learningName()}-order hint`, checked: s[way].hint, onchange: set(`${way}.hint`) });
  const literalRow = () => ui.switchRow({ title: `Show the ${learningName()}-order line with the answer`, checked: s[way].literal, onchange: set(`${way}.literal`) });
  // Each way's own options, above its help.
  const own = {
    arrange: () => [
      ui.group(
        null,
        [
          ui.choiceRow({ title: "What you put in order", options: [["mix", `${learningFromName()} for new sentences, then ${learningName()}`], ["dutch", `The ${learningName()} words`], ["english", `The ${learningFromName()}, in ${learningName()} order`]], value: s.arrange.tiles, onchange: set("arrange.tiles") }),
          ui.switchRow({ title: "One stray tile", sub: "A word that isn't in the sentence", checked: s.arrange.stray, onchange: set("arrange.stray") }),
        ],
      ),
    ],
    type: () => [
      ui.group(null, [
        ui.choiceRow({ title: "From", options: [["english", "The English"], ["audio", "What you hear"]], value: s.type.from, onchange: set("type.from") }),
        ui.choiceRow({ title: "Accents", options: [["forgiving", "Forgiving"], ["strict", "Strict"]], value: s.type.accents, onchange: set("type.accents") }),
      ]),
    ],
    listen: () => [
      ui.group(
        null,
        [ui.choiceRow({ title: "After you hear it", options: [["mix", "Depends on how well you know it"], ["meaning", "Pick what it means"], ["order", "Put the words in order"], ["type", "Type what you heard"]], value: s.listen.mode, onchange: set("listen.mode") })],
      ),
    ],
    repeat: () => [
      ui.group(null, [ui.choiceRow({ title: "When you see the sentence", options: [["after", "After you've said it"], ["always", "While you listen"]], value: s.repeat.show, onchange: set("repeat.show") })]),
      ui.group(null, [ui.listRow({ title: "Speaking", value: engineName(), href: "#settings/study/speaking" })]),
    ],
  };
  // A game with no settings of its own (Type the word, Type in the gap, Type what it says, Say the word, Repeat the word) has no hint or
  // word-for-word line to offer: only whether it's used. (Their rows read its settings, and opening one of these games' pages threw.)
  const lines = !s[way] ? [] : way === "listen" || way === "repeat" ? [literalRow()] : [hintRow(), literalRow()];
  const groups =
    way === "match"
      ? [ui.group(null, [ui.choiceRow({ title: "Pairs in a round", options: [[4, "4"], [5, "5"], [6, "6"]], value: s.match.pairs, onchange: set("match.pairs") })])]
      : [...(own[way]?.() ?? []), ...(lines.length ? [ui.group(null, lines)] : [])];
  page.replaceChildren(
    ui.pageTitle(GAMES[way].name),
    ui.group(null, [ui.switchRow({ title: "Use in your day and quick sessions", checked: s.quick.include[way], onchange: (value) => setStudySetting(`quick.include.${way}`, value) })]),
    ...groups,
  );
  return { title: GAMES[way].name, back };
}

// ---------- Your AI ----------

// ---------- Storage ----------

function storage(page) {
  // A copy on someone's own computer: no store's app is registered for its address, so there's nothing to connect here.
  if (!knownProviders().length) {
    page.replaceChildren(ui.pageTitle("Sync across devices", "A copy on your own computer has no cloud storage to connect. What's yours stays in this browser, and Your data can download all of it."));
    return { title: "Sync across devices" };
  }
  const msg = message();
  const list = el("ul", { part: "list" });
  const check = async (provider) => {
    const name = "lexicommons-check.json";
    const payload = JSON.stringify({ hello: "Lexicommons", writtenAt: new Date().toISOString() });
    await writeFile(provider, name, new Blob([payload], { type: "application/json" }), "application/json");
    const listed = (await listFiles(provider)).find((f) => f.name === name);
    if (!listed) throw new Error("the file was written but isn't in the folder");
    const back = await (await readFile(provider, name)).text();
    if (back !== payload) throw new Error("the file read back doesn't match what was written");
    return `${PROVIDERS[provider]} works: wrote a file, found it, and read it back the same.`;
  };
  const offered = knownProviders();
  const render = () => {
    const synced = Object.fromEntries(sync.syncStatus().targets.map((t) => [t.id, t]));
    list.replaceChildren(
      ...Object.entries(PROVIDERS).filter(([provider]) => offered.includes(provider)).map(([provider, name]) => {
        const connected = isConnected(provider);
        const act = (label, run) => async () => {
          try {
            const text = await run();
            if (text) msg.say(text, "right");
          } catch (error) {
            // A sign-in that ended (storage.js) is said on its own row, beside Connect: no second line saying it again.
            if (error?.ended) msg.say("");
            else msg.say(`${label}: ${error.message}`, "wrong");
          }
          render();
          renderSync();
        };
        const target = synced[provider];
        return ui.listRow({
          title: name,
          // A sign-in that ended (storage.js signInEnded) says so once, beside the Connect that makes a new one.
          sub: connected
            ? target?.error
              ? `The last sync failed: ${target.error}`
              : target?.at
                ? `Synced ${when(target.at)}`
                : "Connected"
            : signInEnded(provider)
              ? "Its sign-in ended. Connect it again to keep syncing."
              : undefined,
          trailing: el(
            "span",
            { class: "lx-row-end" },
            connected
              ? [
                  ui.button("Check", { size: "sm", onclick: act(name, () => check(provider)) }),
                  ui.button("Disconnect", { variant: "fade", size: "sm", onclick: act(name, async () => (await disconnect(provider), `${name} disconnected; its sign-in is gone from this device.`)) }),
                ]
              : ui.button("Connect", { variant: "fade", size: "sm", onclick: act(name, () => connect(provider)) }),
          ),
        });
      }),
    );
  };
  // What syncs through it, and when it last did.
  const state = el("ul", { part: "list" });
  const kept = el("ul", { part: "list" });
  const renderSync = (status = sync.syncStatus()) => {
    // "Through your account", mid-sentence; a storage by its own name.
    const names = status.targets.map((t) => (t.id === sync.ACCOUNT_STORE ? "your account" : t.name)).join(" and ");
    state.replaceChildren(
      ui.listRow({
        title: status.syncing ? "Syncing…" : !status.targets.length ? "Not syncing" : status.at ? `Last synced ${when(status.at)}` : "Not synced yet",
        sub: !status.targets.length ? undefined : status.error ? `It didn't finish: ${status.error}` : `Through ${names}`,
        trailing: status.targets.length
          ? ui.button("Sync now", {
              size: "sm",
              onclick: async () => {
                const after = await sync.syncNow();
                if (after.error) msg.say(after.error, "wrong");
                else msg.say(`Synced with ${names}`, "right");
              },
            })
          : el("span"),
      }),
    );
    kept.replaceChildren(
      ...status.kinds.map((kind) =>
        ui.listRow({
          title: kind.label,
          sub: kind.error ?? (kind.count == null ? "" : `${kind.counted ? kind.counted(kind.count) : kind.count.toLocaleString()} on this device`),
        }),
      ),
    );
    render();
  };
  renderSync();
  const stop = sync.onSyncStatus(renderSync);
  sync.syncNow();
  const flash = sessionStorage.getItem("lc_storage_flash");
  if (flash) {
    sessionStorage.removeItem("lc_storage_flash");
    msg.say(flash, "right");
  }
  // What's kept there and how it syncs, a press away.
  const whatsKept = () => {
    const sheet = ui.sheetLayer({ label: "What's kept there" });
    sheet.lxBody.append(
      el(
        "div",
        { class: "lx-stack lx-sheet-words" },
        el("h2", { class: "lx-sheet-title" }, "What's kept there"),
        kept,
        el("p", {}, "Lexicommons only sees its own folder there, and the connection lives on this device."),
        el("p", {}, "Each storage you connect keeps a whole copy, and your devices sync through it: a few seconds after a change, when you come back to the app, and every 15 minutes. When two devices change the same thing, the later change wins, going by each device's clock."),
        el("p", {}, "Anyone who can change the files Lexicommons keeps there can change what syncs to your devices, so keep that storage to yourself; clearing your study progress everywhere goes through your account, so no file can do that. A book from the shelf or Explore goes as its place in your library, and is fetched again on the device that opens it."),
      ),
    );
    sheet.lxOpen();
  };
  page.replaceChildren(
    ui.pageTitle(
      "Sync across devices",
      sync.syncTargets().some((t) => t.id === sync.ACCOUNT_STORE)
        ? "Your progress, your packs and your texts are kept with your account, the same on every device you sign in on. Connect your own cloud to keep your packs' sounds in step too."
        : "Your progress, packs and texts, the same on each of your devices, through your own cloud.",
    ),
    el("section", { class: "lx-group" }, list),
    msg,
    el("section", { class: "lx-group" }, state, el("ul", { part: "list" }, ui.listRow({ title: "What's kept there", opens: "sheet", onclick: whatsKept }))),
  );
  return { title: "Sync across devices", dispose: stop };
}

// ---------- Your data ----------

const answers = (n) => `${n.toLocaleString()} ${n === 1 ? "answer" : "answers"}`;
const day = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** What syncs, said after "live on this device." (nothing without a storage connected). */
function syncedNote() {
  const status = sync.syncStatus();
  // (Your account's own copy carries your progress, said where this note goes; this is about a storage of your own.)
  const own = status.targets.filter((t) => t.id !== sync.ACCOUNT_STORE);
  if (!own.length) return "";
  const labels = status.kinds.map((k) => k.label.toLowerCase());
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0];
  return ` With ${own.map((t) => t.name).join(" and ")} connected, your ${list} sync between your devices.`;
}

/**
 * Clearing study progress: on this device (two presses), or with a storage connected, everywhere (a sheet that says
 * so), and while a clear can still be undone, a row to bring it back.
 */
function clearProgressRows(page, msg) {
  const targets = sync.syncTargets();
  // Where a clear reaches, in words: with your account keeping its own copy, every device you're signed in on and that copy; and any
  // storage of your own that's connected.
  const kept = targets.some((t) => t.id === sync.ACCOUNT_STORE);
  const own = targets.filter((t) => t.id !== sync.ACCOUNT_STORE).map((t) => t.name);
  const names = kept ? ["your account's own copy", ...own].join(" and ") : own.join(" and ");
  const reach = kept ? `on every other device you're signed in on at its next sync, and in ${names}` : `on every device using ${names} at its next sync`;
  const again = () => data(page);
  const undo = async (id) => {
    try {
      const n = await undoClear(id);
      sync.syncNow();
      again();
      return n;
    } catch (error) {
      throw new Error(`Undo needs your account: ${error.message}`);
    }
  };
  const rows = [];
  if (!targets.length) {
    rows.push(
      twoStepRow({
        title: "Clear study progress on this device",
        sub: `${answers(allEvidence().length)} so far`,
        confirm: "Press again to clear it",
        action: async () => {
          await clearProgress();
          await forgetDerived();
          msg.say("Study progress on this device cleared", "right");
        },
      }),
    );
  } else {
    const confirm = () => {
      const count = allEvidence().length;
      const sheet = ui.sheetLayer({ label: "Clear study progress everywhere", onClose: () => sheet.remove() });
      sheet.lxBody.append(
        el("h2", { class: "lx-sheet-title" }, "Clear study progress everywhere?"),
        el(
          "p",
          {},
          `This clears your study progress up to now: on this device at once (${answers(count)}), and ${reach}. Answers made after it stay. For ${UNDO_CLEAR_DAYS} days you can bring it back with Undo, here or on any of those devices.`,
        ),
        el(
          "div",
          { class: "lx-inline-form" },
          ui.button("Clear everywhere", {
            variant: "danger",
            onclick: async () => {
              try {
                await clearProgress({ everywhere: true });
              } catch (error) {
                sheet.lxClose();
                msg.say(`Nothing was cleared: clearing everywhere goes through your account, and it couldn't be reached (${error.message}).`, "wrong");
                return;
              }
              // What was worked out from it and kept (the word index, the plan's parts) goes with it, as a clear on this device alone takes it.
              await forgetDerived();
              const [batch] = clearedProgress();
              sheet.lxClose();
              sync.syncNow();
              again();
              lookToast("right", "Study progress cleared everywhere", { undo: batch ? () => undo(batch.id) : undefined });
            },
          }),
          ui.button("Cancel", { variant: "fade", onclick: () => sheet.lxClose() }),
        ),
      );
      page.append(sheet);
      sheet.lxOpen();
    };
    rows.push(ui.listRow({ title: "Clear study progress everywhere", sub: kept ? `${answers(allEvidence().length)} so far, on every device and in your account's copy` : `${answers(allEvidence().length)} so far, on every device using ${names}`, trailing: el("span"), onclick: confirm }));
  }
  for (const batch of clearedProgress()) {
    rows.push(
      ui.listRow({
        title: "Bring back cleared study progress",
        sub: `${answers(batch.rows)} cleared ${when(batch.at)}; Undo works until ${day(batch.until)}`,
        trailing: ui.button("Undo", {
          size: "sm",
          onclick: async () => {
            try {
              const n = await undo(batch.id);
              lookToast("right", `${answers(n)} brought back`);
            } catch (error) {
              msg.say(error.message, "wrong");
            }
          },
        }),
      }),
    );
  }
  return rows;
}

function data(page) {
  let deleteTexts = null;
  const practicesRow = twoStepRow({
    title: "Delete practices with your AI on this device",
    confirm: "Press again to delete them",
    action: async () => {
      await clearPractices();
      msg.say("Practices on this device deleted", "right");
    },
  });
  practicesRow.hidden = true;
  listPractices()
    .then((list) => (practicesRow.hidden = !list.length))
    .catch(() => {});
  const msg = message();
  const exportAll = async () => {
    try {
      const server = await api("/api/me/export");
      const look = JSON.parse(await (await theme.exportTheme()).text());
      const file = {
        ...server,
        device: {
          appearance: theme.getSettings(),
          theme: look,
          studySettings: getStudySettings(),
          studyEvidence: allEvidence(),
          // The packs your AI made, and which packs (yours or built-in) you've turned off.
          packs: yourPacks().map(({ pack, addedAt, changedAt, by }) => ({ ...pack, addedAt: new Date(addedAt).toISOString(), changedAt: new Date(changedAt).toISOString(), by })),
          packsOff: packsOff(),
          practices: await listPractices(),
          // Your texts' titles, where you are in each and your highlights (the texts themselves stay out: they can be whole
          // books).
          texts: await readingExport(),
          // The words you've said you know, as you read (per language).
          wordBank: bankExport(),
          // The things you finished each day and your pauses: what your streak counts.
          streak: streakExport(),
          storageConnections: Object.keys(PROVIDERS).filter((p) => isConnected(p)),
        },
      };
      const name = `lexicommons-export-${new Date().toISOString().slice(0, 10)}.json`;
      const text = JSON.stringify(file, null, 2);
      download(name, text);
      msg.say(`Downloaded ${name} (${bytes(text.length)})`, "right");
    } catch (error) {
      msg.say(error.message, "wrong");
    }
  };
  page.replaceChildren(
    ui.pageTitle("Your data"),
    msg,
    ui.group(null, [
      ui.listRow({ title: "Download everything", trailing: el("span"), onclick: exportAll }),
      wordsRow(
        "What's in the download",
        `Your account, your ways to sign in${aiConnected() ? " and tokens (no secrets)" : ""}, sessions, ${aiConnected() ? "connected apps, what your AI sent, " : ""}and from this device your appearance, study settings, study progress, your packs, ${aiConnected() ? "practices with your AI, " : ""}your texts' titles, where you are in each and your highlights and notes, and which storage you've connected.`,
      ),
    ]),
    // The deletes, each saying what it takes: no heading over them (the 6 Nov audit).
    el(
      "section",
      { class: "lx-group", "aria-label": "Start over" },
      el(
        "ul",
        { part: "list" },
        ...clearProgressRows(page, msg),
        // Your texts go to your other devices (read/store.js, the texts kind): deleting them is everywhere, with a week to bring them back.
        (deleteTexts = twoStepRow({
          title: "Delete your texts everywhere",
          sub: `Everything in Read on every device you're signed in on, your place in each, your highlights and notes. For ${TEXTS_BACK_DAYS} days you can bring them back here.`,
          confirm: "Press again to delete them everywhere",
          action: async () => {
            const n = await deleteTextsEverywhere();
            await clearRemovedTexts();
            // A toast, as Bring back's: the page is drawn again at once, with the row that brings them back.
            lookToast("right", n ? `${n === 1 ? "Your text" : "Your texts"} deleted everywhere` : "There were no texts to delete");
            data(page);
          },
        })),
        // Only with some to delete (they come from an AI, connected now or once).
        practicesRow,
      ),
      ...(sync.syncTargets().length
        ? [el("p", { part: "group-note" }, `${sync.syncTargets().some((t) => t.id === sync.ACCOUNT_STORE) ? "Your study progress, your packs and your texts are kept with your account." : "Your study progress, your packs and your texts go to your other devices through your own storage."}${syncedNote()}`)]
        : []),
    ),

  );
  // Texts deleted everywhere from here, for their week: one row to bring them all back (on every device).
  textsToBringBack().then((kept) => {
    if (!kept.length || !deleteTexts?.isConnected) return;
    deleteTexts.after(
      ui.listRow({
        title: "Bring back deleted texts",
        sub: `${kept.length === 1 ? "1 text" : `${kept.length} texts`}; you can bring them back until ${day(Math.min(...kept.map((t) => t.until)))}`,
        trailing: ui.button("Bring back", {
          size: "sm",
          onclick: async () => {
            const n = await bringBackTexts();
            lookToast("right", `${n === 1 ? "1 text" : `${n} texts`} brought back`);
            data(page);
          },
        }),
      }),
    );
  });
  return { title: "Your data" };
}

/** What's kept on the device that was worked out from progress and packs (the word index, the plan's parts): it goes when they do. */
async function forgetDerived() {
  await Promise.all([import("../know/word-index.js").then((m) => m.forgetWordIndex()), import("../study/plan-kept.js").then((m) => m.forgetPlanKept())]).catch(() => {});
}

/**
 * Everything Lexicommons keeps on this device, gone: progress, practices, packs, texts, the word bank, settings, the look, storage
 * connections, and what was worked out from them. After an account is deleted, and when another account takes the device for its own
 * progress (shell/other-owner.js). Nothing here asks the server anything.
 */
export async function clearThisDevice() {
  await clearProgress();
  await clearPractices();
  await clearPacks();
  // Translate's index kept on this device holds your packs' sentences.
  await import("../translate/translate.js").then((m) => m.forgetTranslateIndex()).catch(() => {});
  await clearReading();
  await clearRemovedTexts();
  clearBanks();
  resetStudySettings();
  await theme.resetLook().catch(() => {});
  await theme.clearHistory();
  for (const provider of Object.keys(PROVIDERS)) if (isConnected(provider)) await disconnect(provider).catch(() => {});
  await forgetKeys().catch(() => {});
  // Last, so nothing above brings them back: what was worked out from the progress and the packs, and kept.
  await forgetDerived();
  for (const key of Object.keys(localStorage)) if (key.startsWith("lx.") || key.startsWith("lc_")) localStorage.removeItem(key);
}

/** Deleting your account: red from the start, asking once on the row (Account's page, the 6 Nov audit: it lives only there). */
function deleteAccountGroup(msg) {
  return ui.group(
    null,
    [
      twoStepRow({
        variant: "danger",
        title: "Delete my account",
        confirm: "Press again to delete it for good",
        action: async () => {
          // Deleting clears this device's own progress, which the sample learner stands in for: it goes first (study/sample-mode.js).
          if (sampleOn()) return msg.say("Turn the sample learner off first, in Admin.", "wrong");
          try {
            await del("/api/me", { confirm: "delete my account" });
            await clearThisDevice();
            location.assign("/login?deleted=1");
          } catch (error) {
            msg.say(error.message, "wrong");
          }
        },
      }),
      wordsRow(
        "What deleting takes",
        "It removes your account from Lexicommons for good: your passkeys and other ways to sign in, tokens, connected apps, notes and files, and this device's progress, packs, texts, settings and storage connections.",
        "What your own storage keeps stays there, yours to delete. Download everything first if you want a copy.",
      ),
    ],
  );
}

// ---------- About ----------

function about(page, ctx) {
  // The version running, and under it, only while a newer one is ready on this device, a row saying so with Reload (shell/new-version.js:
  // nothing else anywhere says it). Add to Home Screen: this device's steps (or the browser's own install button) on a page of its own.
  const rows = () => [
    ui.listRow({ title: "Privacy", href: "/privacy" }),
    ui.listRow({ title: "Terms", href: "/terms" }),
    ui.listRow({ title: "Version", value: appVersion() }),
    ...(newVersionReady()
      ? [ui.listRow({ title: "A new version is ready", trailing: ui.button("Reload", { variant: "fade", size: "sm", onclick: reloadIntoNewVersion }) })]
      : []),
  ];
  const first = ui.group(null, rows());
  page.replaceChildren(ui.pageTitle("About", "Free and open source."), first, ui.group(null, [sourceRow()]), ui.group(null, [installAboutRow()]));
  // Ready while the page is open: the row comes in its place.
  const dispose = onNewVersionReady(() => first.isConnected && first.replaceWith(ui.group(null, rows())));
  return { title: "About", dispose };
}

/** The code the app runs, on GitHub: the AGPL offers it to everyone who uses the app. Opened in the browser, beside the app, with GitHub's
 * own mark as the sign-in button draws it (lx/brands.js). */
const SOURCE_URL = "https://github.com/Imaginative-Prompting/lexicommons";
function sourceRow() {
  const holder = document.createElement("span");
  holder.innerHTML = SIGN_IN_WAYS.github.mark;
  const item = ui.listRow({ art: holder.firstElementChild, title: "Source code", sub: "On GitHub, under the AGPL", href: SOURCE_URL });
  const link = item.querySelector("a");
  if (link) Object.assign(link, { target: "_blank", rel: "noopener" });
  return item;
}

// ---------- Admin ----------

/** Admin: what only an admin uses, in one place (the 6 Nov audit): the sample learner, the first run, the sound test, the design system. */
function adminPage(page) {
  const body = el("div", { class: "lx-stack" }, ui.loadingState());
  page.replaceChildren(ui.pageTitle("Admin"), body);
  whoAmI()
    .then((me) => {
      if (!page.isConnected) return;
      if (!me?.roles?.includes("admin")) return body.replaceChildren(el("p", { class: "lx-muted" }, "This is for an admin."));
      // One look for the four: a symbol as the root's, the value where there is one, and the end saying what a press does (the
      // sample learner's sheet with no chevron, the first run starting here, the two pages with theirs). No box on the sheet's row
      // here (shell.css .lx-admin), so the list reads as one.
      // The learner view first (on until turned off here): with it on, the app shows what a learner sees. Feature flags under it. With
      // it off and sharing closed to learners, Share and Ask for it are reached from here (Explore's face leaves them out).
      const learnerRow = ui.switchRow({ symbol: "phone-q", title: t("settings.admin.learnerView"), sub: t("settings.admin.learnerViewSub"), checked: learnerView(), onchange: (on) => (setLearnerView(on), drawSharing()) });
      const sharingRows = el("ul", { part: "list" });
      const drawSharing = () =>
        sharingRows.replaceChildren(
          ...(learnerView() || sharingOpen()
            ? []
            : [ui.listRow({ symbol: "hint-q", title: t("settings.admin.ask"), href: `#explore/requests?lang=${learning()}` }), ui.listRow({ symbol: "share-q", title: t("settings.admin.share"), href: "#explore/yours" })]),
        );
      drawSharing();
      body.replaceChildren(
        el("section", { class: "lx-group lx-admin" }, el("ul", { part: "list" }, learnerRow, ui.listRow({ symbol: "data-q", title: t("settings.admin.flags"), href: "#settings/admin/flags" })), sharingRows),
        el(
          "section",
          { class: "lx-group lx-admin" },
          el(
            "ul",
            { part: "list" },
            sampleRow(),
            ui.listRow({ symbol: "deck-q", title: "Pictures", href: "#settings/admin/pictures" }),
            ui.listRow({ symbol: "path-q", title: "See the first run", trailing: el("span"), onclick: () => openWelcome() }),
            // Temporary: a link from elsewhere would open the browser, and it's the Home Screen app this measures (public/sound-test/).
            ui.listRow({ symbol: "speaker", title: "Sound test", href: "/sound-test/" }),
            // Temporary too: what an iPhone does with a swipe from the left edge, in the Home Screen app and in Safari (public/edge-test/).
            ui.listRow({ symbol: "ways-q", title: "Edge swipe test", href: "/edge-test/" }),
            ui.listRow({ symbol: "palette-q", title: "Design system", href: "/design/" }),
          ),
        ),
      );
    })
    .catch((error) => page.isConnected && body.replaceChildren(ui.loadFailed(error, () => adminPage(page))));
  return { title: "Admin" };
}

// For an admin: the app as a made-up learner sees it, weeks or months in (study/sample-mode.js). Its row says which one is on; its sheet
// picks one, or Off. Picking makes it and reloads onto it; the code that does is loaded only then.
function sampleRow() {
  const on = SAMPLE_PRESETS.find((preset) => preset.id === readSample()?.preset);
  return ui.listRow({
    symbol: "games-q",
    title: "Sample learner",
    value: on ? on.name : "Off",
    opens: "sheet",
    onclick: () => {
      const sheet = ui.sheetLayer({ label: "Sample learner" });
      const status = el("p", { class: "lx-small lx-muted", role: "status" });
      let busy = false;
      const choose = async (id) => {
        if (busy) return;
        busy = true;
        const preset = SAMPLE_PRESETS.find((one) => one.id === id);
        status.textContent = preset ? `Making ${preset.name.toLowerCase()}…` : "Going back to your own progress…";
        try {
          const { startSample, stopSample } = await import("../study/sample-start.js");
          if (preset) await startSample(id);
          else await stopSample();
        } catch (error) {
          status.textContent = error.message;
          busy = false;
        }
      };
      const current = on?.id ?? "";
      sheet.lxBody.append(
        el("h2", { class: "lx-sheet-title" }, "Sample learner"),
        el("p", {}, "The app as a made-up learner sees it, on this device only. Your own progress stays as it is, and nothing is sent anywhere while it's on."),
        el(
          "ul",
          { part: "list" },
          ui.radioRow({ title: "Off", sub: "Your own progress", name: "sample", value: "", checked: !current, onchange: choose }),
          ...SAMPLE_PRESETS.map((preset) => ui.radioRow({ title: preset.name, sub: preset.about, name: "sample", value: preset.id, checked: current === preset.id, onchange: choose })),
        ),
        status,
      );
      sheet.lxOpen();
    },
  });
}

/**
 * Renders a Settings page into `page`. rest = the route after #settings; params.from = "study" when the quick
 * session's gear opened it (its back link then returns to Study). Returns { title, back, dispose }.
 */
export function renderSettings(page, rest, ctx, params = {}) {
  const [section, sub, part, deeper] = rest;
  page.setAttribute("data-settings", "");
  const toStudy = params.from === "study" ? { href: "#study", label: "Study" } : { href: "#settings/study", label: "Study" };
  const toGames = params.from === "study" ? toStudy : { href: "#settings/study/games", label: "Games" };
  const toVoice = { href: "#settings/voice", label: "Sound and speech" };
  // Speaking holds Say it's settings too (the 6 Nov audit): from Games or Study's gear, its back goes there.
  const toSpeaking = params.from === "games" ? { href: "#settings/study/games", label: "Games" } : params.from === "study" ? toStudy : toVoice;
  let view;
  if (section === "account" && sub === "email") view = emailPage(page);
  else if (section === "account") view = account(page, ctx, params);
  else if (section === "appearance" && sub === "edit") view = editPage(page);
  else if (section === "appearance" && sub === "layout") view = layoutPage(page);
  else if (section === "appearance" && sub === "colors") view = colours(page);
  else if (section === "appearance" && sub === "css") view = customCss(page);
  else if (section === "appearance" && sub === "images" && part in theme.SECTIONS) view = sectionImages(page, part);
  else if (section === "appearance" && sub === "images") view = images(page);
  else if (section === "appearance" && sub === "themes" && part) view = themePage(page, part);
  else if (section === "appearance" && (sub === "themes" || sub === "share")) {
    // Share and recent looks (26 Oct) became Your themes.
    if (sub === "share") history.replaceState(history.state, "", "#settings/appearance/themes");
    view = themesPage(page);
  }
  else if (section === "appearance" && sub === "ai") view = askAi(page);
  else if (section === "appearance" && sub === "flags") view = flagsPage(page);
  else if (section === "appearance") {
    // The old single page's address opens the menu that replaced it.
    if (sub) history.replaceState(history.state, "", "#settings/appearance");
    view = appearance(page);
  }
  else if (section === "voice") view = voiceMenu(page);
  else if (section === "translate") view = translateSettings(page);
  else if (section === "study" && sub === "games") view = gamesMenu(page);
  else if (section === "study" && (sub === "practice" || sub === "day")) view = practiceSettings(page, toStudy);
  else if (section === "study" && sub === "quick") view = quickSettings(page, toStudy);
  else if (section === "study" && sub === "memory") view = memorySettings(page, toStudy);
  else if (section === "study" && sub === "cards") view = cardSettings(page, toGames);
  else if (section === "study" && (sub === "voices" || sub === "listening")) {
    // The page's first address (26 Oct) opens it under its new name.
    if (sub === "listening") history.replaceState(history.state, "", "#settings/study/voices");
    view = voicesSettings(page, toVoice);
  } else if (section === "study" && (sub === "speaking" || sub === "say")) {
    // Say it's own page (before 6 Nov) is part of Speaking now.
    if (sub === "say") history.replaceState(history.state, "", `#settings/study/speaking?from=${params.from === "study" ? "study" : "games"}`);
    view = speakingSettings(page, sub === "say" && params.from !== "study" ? { href: "#settings/study/games", label: "Games" } : toSpeaking);
  }
  else if (section === "study" && sub === "packs" && part && deeper === "edit") view = packEditSettings(page, decodeURIComponent(part));
  else if (section === "study" && sub === "packs" && part) view = packSettings(page, decodeURIComponent(part));
  else if (section === "study" && sub === "packs") {
    // Your packs live on Study (6 Nov): the old address becomes Study's, in this entry, once this draw is done.
    view = packsSettings(page, { href: "#study", label: "Study" });
    queueMicrotask(() => /^#settings\/study\/packs(\?|$)/.test(location.hash) && replaceRoute("#study/packs"));
  }
  else if (section === "study" && GAMES[sub]) view = gameSettings(page, sub, toGames);
  else if (section === "study") view = studyMenu(page);
  else if (section === "streak") view = streakSettings(page, params);
  else if (section === "language") view = languageSettings(page);
  else if (section === "reminders") view = remindersSettings(page, params);
  else if (section === "storage") view = storage(page);
  else if (section === "data") view = data(page);
  else if (section === "install") view = installSettings(page, sub, ctx, params);
  else if (section === "about") view = about(page, ctx);
  else if (section === "report") view = reportPage(page, ctx);
  else if (section === "admin" && sub === "flags") view = featureFlagsPage(page);
  else if (section === "admin" && sub === "pictures") view = picturesPage(page);
  else if (section === "admin") view = adminPage(page);
  else if (section === "downloads") view = downloadsPage(page, params.from === "speaking" ? { href: "#settings/study/speaking", label: "Speaking" } : undefined);
  else view = menu(page, ctx);
  return {
    title: view.title,
    get back() {
      return view.back ?? { href: "#settings", label: "Settings" };
    },
    dispose: view.dispose,
    refresh: view.refresh,
    // What the page draws from the device, once it's in (the router holds the page unseen until then, 400 ms at most).
    ready: view.ready,
  };
}
