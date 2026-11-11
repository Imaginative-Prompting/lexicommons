// The microphone in a practice: free speech for a conversation (no sentence to check against: the words go to your AI
// as you said them, with the ones the recognizer doubted), or a sentence to say (a Say it card). The recognizer is the
// one chosen in Settings → Study → Say it (study/speaking.js); nothing goes through Lexicommons' server.

import * as voice from "../study/voice.js";
import { learningLocale } from "../study/learning.js";
import { chooseEngine, loadingText, readyWhisper, speechApi, wakeSpeech } from "../study/speaking.js";

const STATUS = {
  asking: "Waiting for the microphone…",
  listening: "Listening. Speak whenever you're ready.",
  hearing: "Listening… press the microphone when you're done.",
  thinking: "Writing down what you said…",
};

export const SETUP_TEXT = {
  setup: "This browser has no recognizer of its own. Whisper can listen on this device once its model is downloaded: Settings, Study, Say it.",
  unsupported: "This browser can't recognize speech. Type instead, or try another browser.",
};

/** Loads the speech module ahead of the first press, so the press can wake the microphone inside itself (iPhone). */
export const prepareSpeech = () => speechApi();

/**
 * A microphone button's behavior. press() starts listening (or stops it when it's listening). expected: null for
 * free speech, or the sentence to say. onResult(result, choice) with the recognizer's result (speech.js); onError(text)
 * with something to tell the person, and the reason and the recognizer that failed. locale(): the language's locale (nl-NL), asked at each press (a practice's own;
 * the one you're learning unless said). Long pauses are allowed: people stop to think in a new language. choose: which
 * recognizer (chooseEngine unless said); detect(choice): the languages it may be in, for one that can tell (speech.js); onListen(choice)
 * as it starts listening, onEnd() whenever it's finished, one way or another. restart(): cancels, and starts again.
 */
export function microphone({ mic, status, expected = null, onResult, onError, isCurrent = () => true, locale = learningLocale, choose = chooseEngine, detect = () => null, onListen, onEnd }) {
  let listener = null;
  let busy = false;
  let running = null;
  // The button may come after this (a field built round it): set .mic then.
  const button = () => api.mic ?? { lxState() {}, lxLevel() {} };
  const say = (text) => status && (status.textContent = text ?? "");
  async function press() {
    if (listener) return listener.stop();
    if (busy) return;
    running = run();
    return running;
  }
  async function run() {
    wakeSpeech(); // first, inside the press
    busy = true;
    voice.stopSpeaking();
    button().lxState("asking");
    say(STATUS.asking);
    let choice = null;
    try {
      const lang = locale();
      choice = await choose(lang);
      if (!isCurrent()) return;
      if (!choice.engine) {
        say("");
        return onError?.(choice.why ? `${choice.why} Type instead, or try another browser.` : (SETUP_TEXT[choice.reason] ?? SETUP_TEXT.unsupported), choice.reason, choice);
      }
      if (choice.engine === "whisper") {
        button().lxState("loading");
        say(loadingText(0));
        await readyWhisper(choice, (seconds) => isCurrent() && say(loadingText(seconds)));
        if (!isCurrent()) return;
      }
      onListen?.(choice);
      listener = choice.api.listen({
        engine: choice.engine,
        model: choice.model,
        expected,
        lang,
        detect: choice.engine === "whisper" ? detect(choice) : null,
        silence: expected == null ? 1600 : 900,
        wait: 12000,
        longest: expected == null ? 30000 : 15000,
        onState: (state) => {
          button().lxState(state);
          if (STATUS[state]) say(STATUS[state]);
        },
        onLevel: (level) => button().lxLevel(level),
      });
      const result = await listener.done;
      if (!isCurrent()) return;
      say("");
      onResult?.(result, choice);
    } catch (error) {
      if (!isCurrent()) return;
      say("");
      if (error?.code === "aborted") return;
      if (error?.code === "no-speech") return onError?.("Heard nothing. Press the microphone and speak.", "no-speech");
      if (error?.code === "model-missing") return onError?.(SETUP_TEXT.setup, "setup");
      onError?.(error?.message ?? "Something went wrong while listening. Try again.", error?.code, choice);
    } finally {
      listener = null;
      busy = false;
      button().lxState(null);
      onEnd?.();
    }
  }
  const restart = async () => {
    listener?.cancel();
    await running?.catch(() => {});
    return press();
  };
  const api = { mic, press, restart, cancel: () => listener?.cancel(), get listening() { return Boolean(listener) || busy; } };
  return api;
}
