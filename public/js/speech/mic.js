// The microphone: asks for it, records until you stop talking, and hands back 16 kHz mono samples (what Whisper
// takes). Chrome's recognizer gets a stream from openMic() too (and a level meter); Safari's opens the microphone
// itself and never comes here.
//
// iPhone: the AudioContext has to start inside the press that starts listening, so audioContext() is called first
// thing, before anything awaits. The microphone is let go after every recording (the red indicator goes off, and
// iOS puts the speaker back to full volume), unless a game asks to hold it for a run of speaking steps.

import { SpeechError } from "./errors.js";
import { audioSessionFor } from "../lx/audio-session.js";

let context = null;
let worklet = null; // the recorder's worklet module, loading or loaded into `context`
let held = null; // a MediaStream kept open between recordings, when asked

// The launch's stream, when letting it go would mean asking again. An iPhone's Home Screen app keeps no microphone grant from
// one launch to the next (WebKit bug 327237), and some launches don't keep it even between recordings: every getUserMedia
// asks again. Measured on an iPhone 17 Simulator, iOS 26.4, 6 Nov 2026 (scratch/i18n/mic): it happened in 4 of 6 launches
// opened within a minute or two of being closed, never in a Safari tab, and the Permissions API read "prompt" after the yes
// in most of those launches but "granted" in one (with Safari's Microphone set to Allow). So in the Home Screen app, once a
// launch shows it forgets (the Permissions API reading "prompt" right after a yes, or a later getUserMedia taking long enough
// that it must have asked again), its stream is kept, its tracks off between recordings, until the app leaves the screen.
// Every other launch lets each recording's tracks go as before: the indicator goes off and the speaker back to full volume.
let keptMic = null; // { stream, processing }
let opened = 0; // getUserMedia calls this launch that answered
const ASKED_MS = 300; // a getUserMedia that took this long asked (unasked it answered in 4–80 ms; nobody answers a prompt faster)
const apple = () => /iPhone|iPad|iPod/.test(navigator.userAgent ?? "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const homeScreen = () => globalThis.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
async function grantHolds() {
  try {
    return (await navigator.permissions?.query({ name: "microphone" }))?.state !== "prompt";
  } catch {
    return true;
  }
}
function letKeptGo() {
  for (const track of keptMic?.stream.getTracks?.() ?? []) track.stop();
  keptMic = null;
}
globalThis.document?.addEventListener?.("visibilitychange", () => {
  if (document.visibilityState === "hidden" && keptMic && keptMic.stream !== held) letKeptGo();
});

/** The one AudioContext, started (call this synchronously inside the press). */
export function audioContext() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) throw new SpeechError("unsupported", "This browser can't record audio.");
  if (!context || context.state === "closed") {
    context = new Context({ latencyHint: "interactive" });
    worklet = null;
  }
  if (context.state !== "running") context.resume().catch(() => {});
  return context;
}

/**
 * Starts loading the recorder's worklet into the AudioContext, once (a failed load is tried again next time). Call
 * it as early as the press allows (speech.js wake): a context's first worklet moves its audio onto the worklet's own
 * thread, and Chrome restarts the audio output to do it. With Bluetooth headphones that takes most of a second
 * (0.85 to 0.92 s measured with AirPods Pro, 33 ms on a fake output device), so a recorder started without it
 * waited that long for its first audio. → Promise<boolean> (false: no AudioWorklet here)
 */
export function loadCapture(ctx = audioContext()) {
  if (!ctx.audioWorklet) return Promise.resolve(false);
  worklet ??= ctx.audioWorklet.addModule(new URL("./capture-worklet.js", import.meta.url)).then(
    () => true,
    (error) => {
      worklet = null;
      throw error;
    },
  );
  return worklet;
}

/**
 * The microphone's stream, asking for permission if needed. processing: the browser's noise suppression, echo
 * cancellation and gain control. Whisper hears better without them (it was trained on unprocessed audio; on the
 * starter deck's recordings they made it mishear one sentence it otherwise heard right); the browser's own
 * recognizer keeps them.
 */
export async function openMic({ processing = true } = {}) {
  if (held?.active) return held;
  if (!globalThis.isSecureContext) throw new SpeechError("unsupported", "The microphone only works on a secure (https) page.");
  if (!navigator.mediaDevices?.getUserMedia) throw new SpeechError("unsupported", "This browser can't use the microphone.");
  audioSessionFor("microphone");
  // The launch's kept stream, its tracks back on: no asking again.
  if (keptMic?.stream.active && keptMic.processing === processing) {
    for (const track of keptMic.stream.getTracks()) track.enabled = true;
    return keptMic.stream;
  }
  try {
    const asked = performance.now();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: processing, noiseSuppression: processing, autoGainControl: processing },
    });
    const askedAgain = opened++ > 0 && performance.now() - asked >= ASKED_MS;
    if (apple() && homeScreen() && (askedAgain || !(await grantHolds()))) {
      letKeptGo();
      keptMic = { stream, processing };
    }
    return stream;
  } catch (error) {
    audioSessionFor("idle");
    const name = error?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new SpeechError("denied", undefined, { cause: error });
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new SpeechError("no-mic", undefined, { cause: error });
    if (name === "NotReadableError" || name === "AbortError") throw new SpeechError("busy", undefined, { cause: error });
    throw new SpeechError("failed", undefined, { cause: error });
  }
}

/** Keep the microphone open after recordings (true) or let it go now (false). */
export function holdMic(stream, hold) {
  if (hold) held = stream;
  else releaseMic(held);
}

/** Lets a stream go (or, with none given, the one being held). The launch's kept stream only has its tracks turned off. */
export function releaseMic(stream = held) {
  const keep = stream && stream === keptMic?.stream;
  for (const track of stream?.getTracks?.() ?? []) {
    if (keep) track.enabled = false;
    else track.stop();
  }
  if (stream === held) held = null;
  if (held?.active) return;
  audioSessionFor("idle");
  if (context?.state === "running") context.suspend().catch(() => {});
}

/** Has the browser already been given the microphone? "granted" | "denied" | "prompt" (or "prompt" if it won't say). */
export async function micPermission() {
  try {
    const status = await navigator.permissions?.query({ name: "microphone" });
    return status?.state ?? "prompt";
  } catch {
    return "prompt";
  }
}

// Loudness in 0..1 for a level meter: -60 dBFS is silent, -12 dBFS is full.
const levelOf = (rms) => Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-9) + 60) / 48));

/** Calls onLevel(0..1) about 23 times a second while the stream plays (for the browser's recognizer). → stop() */
export function monitorLevel(stream, onLevel) {
  const ctx = audioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    onLevel(levelOf(Math.sqrt(sum / samples.length)));
  }, 43);
  return () => {
    clearInterval(timer);
    try {
      source.disconnect();
    } catch {}
  };
}

/**
 * Records from the stream until you've spoken and then paused, or stop() is called.
 *   onStart()        once, when the first audio is in the recording: from then on nothing said is lost, so that's
 *                    when to say "listening" (on a first press the recorder can start most of a second after the
 *                    microphone opens)
 *   onLevel(0..1)    about 23 times a second
 *   onSpeech()       once, when speech starts
 *   silence          how long a pause ends it (ms), after speech
 *   wait             how long to wait for speech to start (ms) before giving up with "no-speech"
 *   longest          the longest recording (ms)
 * → { stop(), cancel(), done: Promise<{ audio: Float32Array at 16 kHz, seconds }> }
 */
export function record(stream, { onStart, onLevel, onSpeech, signal, silence = 900, wait = 8000, longest = 15000 } = {}) {
  const ctx = audioContext();
  const blocks = [];
  let rate = ctx.sampleRate;
  let finished = false;
  let source = null;
  let node = null;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  // Voice activity: a noise floor that follows the room while nobody speaks, speech above three times it.
  let floor = null;
  let loudRun = 0;
  let quietMs = 0;
  let speechAt = -1; // block index where speech started
  let speechEnd = -1;
  let elapsed = 0;
  const begun = performance.now();
  let lastBlockAt = begun;

  function onBlock(block) {
    if (finished) return;
    lastBlockAt = performance.now();
    if (!blocks.length) onStart?.();
    blocks.push(block);
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const rms = Math.sqrt(sum / block.length);
    const ms = (block.length / rate) * 1000;
    elapsed += ms;
    onLevel?.(levelOf(rms));
    floor = floor === null ? Math.min(Math.max(rms, 1e-4), 0.02) : floor;
    const speaking = rms > Math.max(floor * 3, 0.01);
    if (speechAt < 0) {
      if (!speaking) floor = Math.min(0.02, 0.9 * floor + 0.1 * rms);
      loudRun = speaking ? loudRun + 1 : 0;
      // Three loud blocks in a row (about 130 ms) is speech, not a click.
      if (loudRun >= 3) {
        speechAt = Math.max(0, blocks.length - loudRun);
        onSpeech?.();
      } else if (elapsed > wait) return finish(new SpeechError("no-speech"));
    } else {
      quietMs = speaking ? 0 : quietMs + ms;
      if (quietMs >= silence) {
        speechEnd = blocks.length;
        return finish();
      }
    }
    if (elapsed >= longest) finish();
  }

  // The clock doesn't only run on audio: a microphone that stops sending (unplugged, or its track ended) still ends
  // the recording on time.
  const watchdog = setInterval(() => {
    const now = performance.now();
    if (now - begun > longest + 1000) finish();
    else if (speechAt < 0 && now - begun > wait + 1000) finish(new SpeechError("no-speech"));
    else if (speechAt >= 0 && now - lastBlockAt > silence) {
      speechEnd = blocks.length;
      finish();
    }
  }, 250);
  for (const track of stream.getAudioTracks()) track.addEventListener("ended", () => (speechAt >= 0 ? ((speechEnd = blocks.length), finish()) : finish(new SpeechError("no-mic"))), { once: true });

  function teardown() {
    clearInterval(watchdog);
    node?.port.postMessage("stop");
    try {
      source?.disconnect();
      node?.disconnect();
    } catch {}
    if (held !== stream) releaseMic(stream);
  }

  async function finish(error) {
    if (finished) return;
    finished = true;
    teardown();
    if (error) return rejectDone(error);
    if (speechAt < 0) return rejectDone(new SpeechError("no-speech"));
    // Keep 300 ms before the speech started and after it stopped.
    const pad = Math.ceil((0.3 * rate) / 2048);
    const from = Math.max(0, speechAt - pad);
    const to = Math.min(blocks.length, (speechEnd < 0 ? blocks.length : speechEnd - Math.floor((silence / 1000) * rate / 2048)) + pad);
    const kept = blocks.slice(from, Math.max(from + 1, to));
    const length = kept.reduce((n, b) => n + b.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const b of kept) samples.set(b, offset), (offset += b.length);
    try {
      resolveDone({ audio: await resample(samples, rate, 16000), seconds: length / rate });
    } catch (e) {
      rejectDone(new SpeechError("failed", undefined, { cause: e }));
    }
  }

  signal?.addEventListener("abort", () => finish(new SpeechError("aborted")), { once: true });

  (async () => {
    try {
      source = ctx.createMediaStreamSource(stream);
      if (ctx.audioWorklet) {
        await loadCapture(ctx);
        if (finished) return;
        node = new AudioWorkletNode(ctx, "lx-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
        node.port.onmessage = (event) => onBlock(event.data);
        source.connect(node);
      } else {
        // Older browsers: the deprecated ScriptProcessor does the same job on the page's thread.
        node = ctx.createScriptProcessor(2048, 1, 1);
        node.port = { postMessage() {} };
        node.onaudioprocess = (event) => onBlock(new Float32Array(event.inputBuffer.getChannelData(0)));
        source.connect(node);
        node.connect(ctx.destination);
      }
      rate = ctx.sampleRate;
    } catch (error) {
      finish(new SpeechError("failed", undefined, { cause: error }));
    }
  })();

  return {
    stop: () => {
      if (speechAt >= 0) speechEnd = blocks.length;
      finish();
    },
    cancel: () => finish(new SpeechError("aborted")),
    done,
  };
}

/** Samples at one rate to another, with the browser's own resampler. */
export async function resample(samples, from, to) {
  if (from === to) return samples;
  const Offline = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
  const length = Math.max(1, Math.ceil((samples.length * to) / from));
  const offline = new Offline(1, length, to);
  const buffer = offline.createBuffer(1, samples.length, from);
  buffer.copyToChannel(samples, 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** A recording or audio file decoded to 16 kHz mono (for tests, and for checking a clip). */
export async function decodeTo16k(arrayBuffer) {
  const Offline = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
  const audio = await new Offline(1, 1, 16000).decodeAudioData(arrayBuffer);
  return audio.getChannelData(0).slice();
}
