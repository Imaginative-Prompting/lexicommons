// /design: the speech engine (js/speech/), live. What this device can do, the Whisper models (download, progress,
// remove), listening with either recognizer to a sentence from the starter deck, everything a result carries, and
// every way listening can fail. Built only from existing parts (lx/ui.js), so the theming surface is unchanged.

import * as ui from "./lx/ui.js";
import { el } from "./lx/ui.js";
import { ITEMS } from "./study/content.js";
import * as speech from "./speech/speech.js";

const BROWSER_STATE = {
  local: "Listens on this device.",
  downloadable: "Can listen on this device once the browser downloads the language; until then, through its maker's servers.",
  server: "Sends your voice to the browser's maker to be recognized (Google for Chrome, Apple for Safari).",
  unknown: "Has a recognizer, but won't say where it runs.",
  none: "Has no recognizer.",
};
const WHISPER_STATE = {
  webgpu: "Runs on the graphics chip (WebGPU).",
  wasm: "Runs on the processor (no WebGPU here): slower.",
  none: "Can't run a speech model in the app.",
};
const RESULT_WORD = { right: "right", close: "close", order: "in the wrong place", wrong: "wrong", missing: "missed" };
const ERRORS = ["denied", "no-mic", "busy", "no-speech", "unsupported", "network", "model-missing", "model-failed", "space", "offline", "download-failed", "aborted"];

const SENTENCES = ITEMS.slice(0, 13).map((item) => ({ id: item.id, text: item.words.map((w) => w[0]).join(" ") + item.punct }));

export function recognisersSection({ section, demo }) {
  let supported = null;
  let engine = "whisper";
  let model = null;
  let sentence = SENTENCES[0];
  const downloads = new Map(); // model id → { controller, have, total }

  const deviceBody = el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "Checking this device…"));
  const modelsBody = el("div", { class: "lx-stack" });
  const choiceBody = el("div", { class: "lx-stack" });
  const said = el("div", { class: "lx-stack", "aria-live": "polite" });
  const status = el("p", { class: "lx-small lx-muted" }, "Press the microphone and read the sentence aloud.");
  const details = el("ul", { part: "list" });

  async function renderDevice() {
    supported = await speech.support("nl-NL");
    model ??= speech.recommendedModel(supported);
    const recommended = speech.MODELS.find((m) => m.id === speech.recommendedModel(supported));
    deviceBody.replaceChildren(
      ui.group(
        null,
        [
          ui.listRow({ icon: "globe", title: `The browser's recognizer: ${supported.browser.state}`, sub: supported.browser.why ?? BROWSER_STATE[supported.browser.state] }),
          ui.listRow({
            icon: "download",
            title: `Whisper, on this device: ${supported.whisper.state}`,
            sub: `${supported.whisper.why ?? WHISPER_STATE[supported.whisper.state]}${supported.whisper.state === "webgpu" ? (supported.whisper.f16 ? " With 16-bit maths." : " Without 16-bit maths, so not the largest model.") : ""}`,
          }),
          ui.listRow({ icon: "sparkle", title: `The model that suits it: ${recommended ? `${recommended.name} (${recommended.id})` : "none"}`, sub: recommended ? recommended.about : "Use the browser's recognizer." }),
        ],
        "Nothing is downloaded or recorded to find this out.",
      ),
    );
  }

  async function renderModels() {
    const rows = [];
    for (const m of speech.MODELS) {
      const usable = supported && (supported.whisper.state === "webgpu" ? m.devices.includes("webgpu") && (!m.needsF16 || supported.whisper.f16) : m.devices.includes("wasm"));
      const state = await speech.modelState(m.id).catch((error) => ({ state: "error", error }));
      const running = downloads.get(m.id);
      let sub;
      let trailing;
      if (running) {
        const pct = running.total ? Math.floor((running.have / running.total) * 100) : 0;
        sub = `Downloading: ${speech.megabytes(running.have)} of ${speech.megabytes(running.total || state.total || 0)} (${pct}%).`;
        trailing = ui.button("Stop", { variant: "fade", size: "sm", onclick: () => running.controller.abort() });
      } else if (state.state === "error") {
        sub = state.error.message;
      } else if (state.state === "ready") {
        sub = `On this device, ${speech.megabytes(state.total)}.`;
        trailing = ui.button("Remove", { variant: "fade", size: "sm", icon: "trash", onclick: async () => (await speech.deleteModel(m.id), renderModels()) });
      } else {
        sub = state.state === "partial" ? `Part downloaded: ${speech.megabytes(state.have)} of ${speech.megabytes(state.total)}.` : `${speech.megabytes(state.total - state.have)} to download, once.`;
        trailing = usable ? ui.button(state.state === "partial" ? "Finish" : "Download", { variant: "gray", size: "sm", icon: "cloud", onclick: () => startDownload(m.id) }) : null;
      }
      rows.push(ui.listRow({ title: `${m.name} · ${m.id}`, sub: `${sub}${usable ? "" : " Can't run on this device."} ${m.about}`, trailing }));
    }
    modelsBody.replaceChildren(ui.group(null, rows, "Downloads are kept on this device (Cache Storage), checked part by part as they arrive. Stopping keeps what's done."));
    renderChoice();
  }

  function startDownload(id) {
    if (downloads.has(id)) return;
    const running = { controller: new AbortController(), have: 0, total: 0 };
    downloads.set(id, running);
    renderModels();
    let last = 0;
    speech
      .downloadModel(id, {
        signal: running.controller.signal,
        onProgress: ({ have, total }) => {
          running.have = have;
          running.total = total;
          // Redraw a few times a second, not on every chunk of bytes.
          if (performance.now() - last > 250) (last = performance.now()), renderModels();
        },
      })
      .catch((error) => {
        if (error.code !== "aborted") status.textContent = error.message;
      })
      .finally(() => {
        downloads.delete(id);
        renderModels();
      });
  }

  function renderChoice() {
    choiceBody.replaceChildren(
      ui.choiceRow({
        title: "Recognizer",
        options: [
          ["whisper", "Whisper, on this device"],
          ["browser", "The browser's"],
        ],
        value: engine,
        onchange: (value) => ((engine = value), renderChoice()),
      }),
      ...(engine === "whisper"
        ? [ui.choiceRow({ title: "Model", options: speech.MODELS.map((m) => [m.id, m.name]), value: model, onchange: (value) => ((model = value), renderChoice()) })]
        : []),
      ui.choiceRow({
        title: "Sentence",
        options: SENTENCES.slice(0, 6).map((s) => [s.id, s.text]),
        value: sentence.id,
        onchange: (value) => ((sentence = SENTENCES.find((s) => s.id === value)), (target.textContent = sentence.text)),
      }),
    );
  }

  const target = el("p", { class: "lx-h2", lang: "nl" }, sentence.text);
  let listener = null;
  const mic = ui.micButton({
    onclick: () => {
      if (listener) return listener.stop();
      // Inside the press, before anything waits: iPhone only starts audio from a press.
      speech.wake();
      mic.lxState("asking");
      said.replaceChildren();
      details.replaceChildren();
      status.textContent = "Starting…";
      listener = speech.listen({
        engine,
        model,
        expected: sentence.text,
        lang: "nl-NL",
        onState: (state) => {
          mic.lxState(state);
          status.textContent = { asking: "Waiting for the microphone.", loading: "Getting the model ready (recording starts anyway).", listening: "Listening. Say the sentence.", hearing: "Hearing you…", thinking: "Working out what you said." }[state] ?? state;
        },
        onLevel: (level) => mic.lxLevel(level),
      });
      listener.done
        .then((result) => {
          const m = result.match;
          said.replaceChildren(ui.saidLine(m.words), ui.feedback(m.ok ? "right" : "wrong", m.ok ? "That's it" : "Not quite", m.ok ? null : m.words.filter((w) => w.result !== "right" && w.result !== "close").map((w) => `${w.text}: ${RESULT_WORD[w.result]}${w.heard ? ` (heard “${w.heard}”)` : ""}`).join(" · ") || `Also heard: ${m.extra.join(" ")}`));
          status.textContent = "Press the microphone to try again.";
          const rows = [
            ["Heard", result.heard || "nothing clear"],
            ["Passed", m.ok ? "yes" : "no"],
            ["How", m.how === "fit" ? `the recording fits the sentence (an accent), Δ ${m.fit.delta}` : `the words it heard${m.fit ? `, Δ ${m.fit.delta}` : ""}`],
            ["Score", String(m.score)],
            ["Extra words", m.extra.join(" ") || "none"],
            ["Recognizer", result.engine === "whisper" ? `${result.model} on ${result.device === "webgpu" ? "WebGPU" : "WebAssembly"}` : `the browser's${result.local ? ", on this device" : ""}`],
            ["Time", `${result.ms.listening} ms listening, ${result.ms.thinking} ms working it out`],
          ];
          details.replaceChildren(...rows.map(([title, value]) => ui.listRow({ title, value })));
        })
        .catch((error) => {
          mic.lxState(null);
          said.replaceChildren(ui.feedback(error.code === "aborted" ? "hint" : "wrong", error.code, error.message));
          status.textContent = "Press the microphone to try again.";
        })
        .finally(() => {
          listener = null;
          mic.lxState(null);
          renderModels();
        });
    },
  });

  renderDevice()
    .then(renderModels)
    .catch((error) => (deviceBody.textContent = error.message));

  return section(
    "recognizers",
    "Recognizers",
    "The speech engine behind Say it: the browser's own recognizer, or Whisper running here on WebGPU. Neither goes through our server. The result marks every word right, close, in the wrong place, wrong or missed, and a word order slip is always reported as said.",
    demo("This device", deviceBody),
    demo("Whisper models", modelsBody),
    demo("Try it", choiceBody, target, el("div", { class: "lx-row" }, mic, status), said, details),
    demo(
      "When it can't listen: each error's code and what it tells you",
      el("div", { class: "lx-stack" }, ERRORS.map((code) => ui.feedback(code === "aborted" ? "hint" : "wrong", code, new speech.SpeechError(code).message))),
    ),
  );
}
