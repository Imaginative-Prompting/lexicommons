// Settings → Sound and speech → Voices: what reads the language you're learning to you. A pack's recorded voices belong to the pack (they take turns, and
// a pack's page will pin one), so this page holds only what's yours everywhere: recordings on or off, this device's
// voice for everything else (each with a speak button, to compare by ear), the speed, and what plays by itself.
// Settings → Sound and speech → Speaking: what hears you: the browser's recognizer or Whisper on this device, with a place to try
// them. Settings → Study → Say it: the speaking game's own options.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { ITEMS, itemById } from "../study/content.js";
import { getStudySettings, setStudySetting, WAYS } from "../study/settings.js";
import { learningFromName, learningLocale, learningName } from "../study/learning.js";
import * as voice from "../study/voice.js";
import { chooseEngine, loadingText, pickModel, readyWhisper, speechApi, usableModels, wakeSpeech } from "../study/speaking.js";
import { guardReady, onPhone, tryWhisperAgain, whisperStopped } from "../speech/guard.js";
import { wordsRow } from "./settings.js";

const sampleWords = (item) => item.words.map(([text], i) => (i === item.words.length - 1 ? text + (item.punct ?? "") : text));
// The sentence each voice reads: the starter's own when it's here (it has recordings), else a short sentence in the language you're
// learning. None while no pack has come yet: the page goes without its sample, rather than not opening.
const sampleItem = () => itemById.get(voice.SAMPLE_ITEM) ?? ITEMS.find((item) => item.words?.length >= 3 && item.words.length <= 7) ?? null;
const emptyRow = (text) => el("li", { part: "list-row", class: "lx-row-empty" }, el("span", { class: "lx-row-text lx-muted" }, text));

export function voicesSettings(page, back) {
  const sample = sampleItem();
  const s = getStudySettings();
  // Laid out as the page's own children, so the groups space like every other group.
  const groups = el("div", { class: "lx-voice-groups" });
  const render = () => {
    const now = getStudySettings().listening;
    const packVoices = voice.packVoices();
    const chosen = voice.currentDeviceVoiceId();
    const devices = voice.voiceChoices();
    groups.replaceChildren(
      ui.group(
        null,
        [
          ui.switchRow({
            title: "Play a pack's recordings",
            checked: now.recorded,
            onchange: (value) => setStudySetting("listening.recorded", value),
          }),
        ],
      ),
      (devices.length ? ui.pickList : ui.namedGroup)(
        "This device's voice",
        devices.length
          ? devices.map((choice) =>
              ui.radioRow({
                title: choice.name,
                sub: choice.about,
                name: "device-voice",
                value: choice.id,
                checked: choice.id === chosen,
                onchange: (value) => setStudySetting("listening.device", value.slice("device:".length)),
                trailing: ui.speakButton((options) => voice.speakItem(sample, { ...options, choice: choice.id }), { label: `Hear ${choice.name}` }),
              }),
            )
          : [emptyRow(`This browser has no ${learningName()} voice.`)],
      ),
    );
  };
  const stop = voice.onVoicesChange(render);
  render();

  const autoplay = (path, title, sub) => ui.switchRow({ title, sub, checked: path.split(".").reduce((o, k) => o[k], s), onchange: (value) => setStudySetting(path, value) });
  page.replaceChildren(
    ui.pageTitle("Voices"),
    ...(sample ? [el("div", { class: "lx-listening-sample" }, ui.spokenLine(sampleWords(sample), (options) => voice.speakItem(sample, options), { label: "Hear it as you will" }))] : []),
    groups,
    ui.group(null, [
      ui.choiceRow({
        title: "How fast",
        options: [["normal", "Normal"], ["slower", "Slower"]],
        value: s.listening.speed,
        onchange: (value) => setStudySetting("listening.speed", value),
      }),
    ]),
    ui.namedGroup("Plays by itself", [
      autoplay("listening.cards", "Study cards"),
      autoplay("listening.answers", "Answers"),
    ]),
    ui.group(null, [
      wordsRow(
        "About voices",
        `When a pack comes with recorded voices, its sentences take turns between them, so you get used to more than one speaker. A pack's own page lets you keep one of its voices.`,
        `This device's voice reads anything without a recording. It comes with your phone or computer; on iPhone and Mac you can add better-sounding ones under Accessibility → Spoken Content → Voices → ${learningName()}.`,
        "A speak button is always there to play it again, or to stop it.",
      ),
    ]),
  );
  return {
    title: "Voices",
    back,
    dispose: () => {
      stop();
      voice.stopSpeaking();
    },
  };
}

// ---------- Say it ----------

const mb = (bytes) => (bytes ? `${Math.round(bytes / 1048576)} MB` : "");

/** The recognizer in use, in a few words (the Study menu and Say it's settings show it). */
export const engineName = () => (getStudySettings().say.engine === "whisper" && !whisperStopped() ? "Whisper" : "Browser's recognizer");

// When the app died with Whisper in memory, in words: what it was doing then.
const WHILE = { loading: "while it was loading", thinking: "while it was writing down what you said", held: "while it was in memory" };

/** Settings → Study → Speaking: the two recognizers (with Whisper's model and download) and a place to try them. */
export function speakingSettings(page, back) {
  const sample = sampleItem();
  const recognisers = el("div", { class: "lx-voice-groups" });
  let download = null; // { controller, have, total, bar } while downloading
  let downloaded = null; // the bar of a download that finished while this page was open: it stays, full, until you leave
  let disposed = false;

  const render = async () => {
    await guardReady;
    const api = await speechApi();
    if (disposed) return;
    if (!api) {
      recognisers.replaceChildren(ui.namedGroup("Recognizer", [el("li", { part: "list-row", class: "lx-row-empty" }, el("span", { class: "lx-row-text lx-muted" }, "Speaking can't load in this browser."))]));
      return;
    }
    const support = await api.support(learningLocale());
    const model = await pickModel(api, support);
    const state = support.whisper.state === "none" || !model ? null : await api.modelState(model);
    if (disposed) return;
    const stopped = whisperStopped();
    // What's really listening: with Whisper stopped, the browser's, whatever was chosen before.
    const chosen = stopped ? "browser" : getStudySettings().say.engine;
    // Under each only what would surprise: why it can't be used, where your voice goes, a warning. What each is, behind About recognizers.
    const browserSub =
      support.browser.state === "local"
        ? undefined
        : support.browser.state === "server" || support.browser.state === "unknown"
          ? "Your voice goes to the browser's maker, so it needs a connection."
          : support.browser.why || "This browser doesn't have one.";
    const whisperSub = stopped
      ? `Whisper stopped this app on this device ${WHILE[stopped.stage] ?? "while it was running"}, probably because it ran out of memory. Lexicommons won't start it by itself again.`
      : support.whisper.state === "none"
        ? support.whisper.why || "This browser can't run it."
        : [support.whisper.state === "wasm" ? "Slower here: this device can't run it on its graphics chip." : null, onPhone() ? "A phone may not have the memory for it." : null].filter(Boolean).join(" ") || undefined;
    const radio = (id, title, sub, usable) => {
      const row = ui.radioRow({ title, sub, name: "engine", value: id, checked: chosen === id, onchange: (value) => (setStudySetting("say.engine", value), render()) });
      if (!usable) row.querySelector("input").disabled = true;
      return row;
    };
    // Which Whisper: the models this device can run, the one that suits it first. They differ a lot in size and in
    // how faithfully they hear a wrong word order, so it's a choice (each model's own description says how). Read
    // before the rows are built: nothing waits between building them and putting them on the page.
    const usable = usableModels(api, support);
    const sizes = await Promise.all(usable.map((m) => api.modelState(m.id).then((st) => st.total).catch(() => 0)));
    if (disposed) return;
    let modelRow;
    if (support.whisper.state === "none" || !model) modelRow = null;
    else if (download) {
      const pct = download.total ? Math.floor((download.have / download.total) * 100) : 0;
      // The same bar every time the row is drawn, so Tinta pours on through each piece.
      if (download.total) download.bar.set(download.have / download.total);
      modelRow = ui.listRow({ title: `Downloading Whisper… ${pct}%`, sub: [`${mb(download.have)} of ${mb(download.total)}. You can leave this page; it carries on.`, download.bar], trailing: ui.button("Stop", { variant: "fade", size: "sm", onclick: () => download?.controller.abort() }) });
    } else if (state?.state === "ready") {
      // It's here: removing it, with everything else downloaded, is Settings → Downloads'.
      modelRow = ui.listRow({ title: "Whisper is on this device", value: mb(state.total), href: "#settings/downloads?from=speaking" });
      // Downloaded just now: its bar stays, full, Tinta come out at its far end.
      if (downloaded) modelRow = ui.listRow({ title: "Whisper is downloaded", sub: ["It works offline now.", downloaded] });
    } else {
      // The page's one way forward: solid, its size on it.
      modelRow = el(
        "li",
        { class: "lx-row-item lx-row-go" },
        ui.button(state?.state === "partial" ? `Finish downloading Whisper · ${mb(Math.max(0, (state.total ?? 0) - (state.have ?? 0)))} left` : `Download Whisper · ${mb(state?.total)}`, { variant: "go", size: "lg", block: true, onclick: () => startDownload(api, model) }),
      );
    }
    const modelChoice =
      support.whisper.state !== "none" && usable.length > 1
        ? ui.choiceRow({
            title: "Whisper model",
            options: usable.map((m, i) => [m.id, `${m.name} · ${mb(sizes[i])}`]),
            value: model,
            onchange: (value) => (setStudySetting("say.model", value), render()),
          })
        : null;
    recognisers.replaceChildren(
      ui.pickList("Recognizer", [
        radio("browser", "This browser's recognizer", browserSub, support.browser.state !== "none"),
        radio("whisper", "Whisper, on this device", whisperSub, support.whisper.state !== "none" && !stopped),
      ]),
      ui.group(
        null,
        [
          stopped ? ui.listRow({ title: "Try Whisper again", sub: "It may stop the app again. If it does, Lexicommons won't start it by itself.", onclick: () => (tryWhisperAgain(), render()) }) : null,
          modelChoice,
          modelRow,
          wordsRow(
            "About recognizers",
            "This browser's recognizer: your voice goes to the browser's maker (Google for Chrome, Apple for Safari), so it needs a connection. Some phones listen on the device instead.",
            "Whisper runs on this device: download it once, then it works offline, and nothing you say leaves this device.",
            ...usable.map((m, i) => `${m.name} (${mb(sizes[i])}): ${m.about}`).filter(() => support.whisper.state !== "none"),
            "If the one you chose can't listen here, the other one does.", `A recognizer can tidy up what it hears, so a slip in word order can still pass in Say it; Type it and ${WAYS.arrange} always catch one.`),
        ].flat().filter(Boolean),
      ),
    );
  };

  // Downloads keep going if you leave the page; this page just shows their progress while it's open.
  const startDownload = (api, model) => {
    if (download) return;
    const controller = new AbortController();
    const bar = ui.downloadBar({ label: "Downloading Whisper" });
    download = { controller, have: 0, total: 0, bar };
    downloaded = null;
    render();
    api
      .downloadModel(model, { signal: controller.signal, onProgress: ({ have, total }) => {
        if (!download) return;
        download.have = have;
        download.total = total;
        if (!disposed) render();
      } })
      .then(() => {
        bar.done();
        downloaded = bar;
      })
      .catch((error) => {
        bar.stop();
        if (error?.code !== "aborted") msg.say(error?.message ?? "The download didn't finish.", "wrong");
      })
      .finally(() => {
        download = null;
        if (!disposed) render();
      });
  };

  // Try it: say the sample sentence with the recognizer chosen above. Every step shows in the line under the button.
  const READY = "Press the microphone and read the sentence aloud.";
  const STATUS = { asking: "Waiting for the microphone…", listening: "Listening. Say it now.", hearing: "Listening…", thinking: "Checking what you said…" };
  const said = el("div", { class: "lx-said", "aria-live": "polite" });
  const status = el("p", { class: "lx-say-status lx-muted" }, READY);
  let listener = null;
  let preparing = false;
  const mic = ui.micButton({
    onclick: async () => {
      if (listener) return listener.stop();
      if (preparing) return;
      wakeSpeech();
      voice.stopSpeaking();
      mic.lxState("asking");
      status.textContent = STATUS.asking;
      const choice = await chooseEngine();
      if (!choice.engine) {
        mic.lxState(null);
        status.textContent = choice.reason === "setup" ? "Download Whisper above first: this browser has no recognizer of its own." : (choice.why ?? "This browser can't recognize speech.");
        return;
      }
      try {
        if (choice.engine === "whisper") {
          // Whisper goes into memory first; only then is the microphone asked for.
          preparing = true;
          mic.lxState("loading");
          status.textContent = loadingText(0);
          try {
            await readyWhisper(choice, (seconds) => (status.textContent = loadingText(seconds)));
          } finally {
            preparing = false;
          }
          if (disposed) return;
        }
        listener = choice.api.listen({
          engine: choice.engine,
          model: choice.model,
          expected: sampleWords(sample).join(" "),
          lang: learningLocale(),
          onState: (state) => {
            mic.lxState(state);
            if (STATUS[state]) status.textContent = STATUS[state];
          },
          onLevel: (level) => mic.lxLevel(level),
        });
        const result = await listener.done;
        said.replaceChildren(ui.saidLine(result.match.words), el("p", { class: "lx-small lx-muted" }, result.heard ? `Heard: “${result.heard}”` : "Heard nothing clear."));
        status.textContent = `${result.match.ok ? "Right." : "Not quite."} With ${choice.engine === "browser" ? "the browser's recognizer" : "Whisper"}.`;
      } catch (error) {
        status.textContent = error?.message ?? "Something went wrong while listening.";
      } finally {
        listener = null;
        mic.lxState(null);
      }
    },
  });

  const msg = el("p", { class: "lx-settings-message", role: "status" });
  msg.say = (text, meaning) => {
    msg.textContent = text;
    msg.setAttribute("data-meaning", meaning);
  };
  // Get Whisper into memory as the page opens, when it's the one chosen and it's on the device, so Try it doesn't wait.
  chooseEngine().then((choice) => {
    if (choice.engine !== "whisper" || disposed) return;
    readyWhisper(choice, (seconds) => !listener && !preparing && !disposed && seconds >= 1 && (status.textContent = loadingText(seconds)))
      .then(() => !listener && !preparing && !disposed && (status.textContent = READY))
      .catch(() => {});
  });
  // Say it, the speaking game (its own page before 6 Nov): its switch and options, under its name.
  const s = getStudySettings();
  const sayIt = el(
    "section",
    { class: "lx-group", "aria-label": "Say it" },
    el("p", { class: "lx-choice-title" }, "Say it"),
    el(
      "ul",
      { part: "list" },
      ui.switchRow({ title: "Use in your day and quick sessions", checked: s.quick.include.say, onchange: (value) => setStudySetting("quick.include.say", value) }),
      ui.choiceRow({
        title: "The sentence",
        options: [["dutch", `${learningName()}: read it aloud`], ["english", `${learningFromName()}: say it in ${learningName()}`]],
        value: s.say.prompt,
        onchange: (value) => setStudySetting("say.prompt", value),
      }),
      ui.switchRow({ title: `Offer the ${learningName()}-order hint`, checked: s.say.hint, onchange: (value) => setStudySetting("say.hint", value) }),
      ui.switchRow({ title: `Show the ${learningName()}-order line with the answer`, checked: s.say.literal, onchange: (value) => setStudySetting("say.literal", value) }),
    ),
  );
  page.replaceChildren(
    ui.pageTitle("Speaking"),
    recognisers,
    sayIt,
    // Try it: the section's own name as its title (no heading over a group), the sentence and the game's own mic, nothing boxed round them.
    ...(sample ? [el("section", { class: "lx-group", "aria-label": "Try it" }, el("p", { class: "lx-choice-title" }, "Try it"), el("ul", { part: "list" }, el("li", { class: "lx-say-try" }, ui.spokenLine(sampleWords(sample), (options) => voice.speakItem(sample, options), { label: "Hear it first" }), el("div", { class: "lx-say-mic" }, mic, status), said)))] : []),
    msg,
  );
  render();
  return {
    title: "Speaking",
    back,
    dispose: () => {
      disposed = true;
      listener?.cancel();
      voice.stopSpeaking();
    },
  };
}
