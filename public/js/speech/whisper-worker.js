// The on-device recognizer: Whisper, run by transformers.js on WebGPU (or WebAssembly where there's no WebGPU), off
// the page's thread. Every file it reads comes from the device (store.js); it never downloads anything itself.
//
// Besides writing down what it heard, it scores sentences against the recording: how likely Whisper finds each one,
// token by token, given the same audio (teacher forcing). speech.js uses that to tell "the recognizer misheard a
// learner's accent" from "the learner said something else".
//
// In:  { type: "load", id, model, device }  → { type: "loaded", id, device, ms } (after a warm-up run)
//      { type: "transcribe", id, audio (Float32Array, 16 kHz), language, score: [sentences to score], detect?: [codes] }
//        → { type: "text", id, text, heard: { lp, words }, scored: [{ text, lp, words: [{ text, min, mean }] }], ms,
//            language?, shares? }
//        detect: the languages it may be (Translate's dictation): it's written down in each, the one Whisper's own first
//        decoding step leans to first (language, shares: { code: share }, written: [{ language, text, mean }]). Whisper leans
//        hard to English on a short word, so the caller decides with what it knows of the words
// Out on failure: { type: "error", id?, code, message }

import { env, pipeline, Tensor } from "/vendor/transformers/transformers.min.js";
import { modelById, runtimeFor } from "./models.js";
import { fileResponse } from "./store.js";

// The model's files are asked for under this made-up address, and answered from the device.
const VIRTUAL = `${self.location.origin}/speech-model/`;
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteHost = VIRTUAL;
env.remotePathTemplate = "{model}/";
env.useBrowserCache = false;
env.useWasmCache = false;
env.useFSCache = false;
env.fetch = async (input) => {
  const url = new URL(String(input));
  if (!url.href.startsWith(VIRTUAL)) throw new Error(`Not a speech model file: ${url.href}`);
  const [pack, ...rest] = url.pathname.slice("/speech-model/".length).split("/");
  const response = await fileResponse(pack, rest.join("/"));
  return response ?? new Response(null, { status: 404, statusText: "Not Found" });
};

let asr = null;
let loaded = null; // `${model}:${device}`

async function webGpuAdapter() {
  try {
    return (await navigator.gpu?.requestAdapter()) ?? null;
  } catch {
    return null;
  }
}

async function load(modelId, wanted) {
  const model = modelById(modelId);
  if (!model) throw Object.assign(new Error(`No model ${modelId}`), { code: "model-missing" });
  const adapter = wanted === "webgpu" ? await webGpuAdapter() : null;
  const device = wanted === "webgpu" && !adapter ? "wasm" : wanted;
  if (!model.devices.includes(device)) throw Object.assign(new Error(`${model.name} can't run without WebGPU.`), { code: "model-failed" });
  if (device === "webgpu" && model.needsF16 && !adapter.features.has("shader-f16")) {
    throw Object.assign(new Error(`This device's WebGPU has no 16-bit maths, which ${model.name} needs. Pick a smaller model.`), { code: "model-failed" });
  }
  const key = `${modelId}:${device}`;
  if (asr && loaded === key) return device;
  if (asr) await asr.dispose().catch(() => {});
  asr = null;
  loaded = null;

  // The runtime's WebAssembly, from the device, handed over as bytes.
  const runtime = runtimeFor(device);
  const wasm = await fileResponse(runtime.pack, runtime.wasm);
  if (!wasm) throw Object.assign(new Error("The speech runtime isn't on this device."), { code: "model-missing" });
  const onnx = env.backends.onnx;
  onnx.wasm.wasmBinary = await wasm.arrayBuffer();
  onnx.wasm.wasmPaths = { mjs: new URL(runtime.mjs, self.location.origin).href, wasm: new URL(runtime.mjs.replace(/\.mjs$/, ".wasm"), self.location.origin).href };
  onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  onnx.wasm.proxy = false;

  asr = await pipeline("automatic-speech-recognition", modelId, { device, dtype: model.dtype[device] });
  // Let generate() take the encoder's output we already have, instead of encoding the audio a second time.
  if (!asr.model.forward_params.includes("encoder_outputs")) asr.model.forward_params = [...asr.model.forward_params, "encoder_outputs"];
  // A second of silence first, so the first real answer doesn't wait for the GPU to compile its shaders.
  await recognise(new Float32Array(16000), "nl", []);
  loaded = key;
  return device;
}

// Whisper's start tokens for a language: <|startoftranscript|> <|nl|> <|transcribe|> <|notimestamps|>
const startTokens = (language) => asr.model._retrieve_init_tokens({ ...asr.model.generation_config, language, task: "transcribe", return_timestamps: false });

/**
 * Frees what a decoder pass returned. Its tensors stay on the GPU until they're disposed: nothing collects them, and each pass
 * leaves about 90 MB on Smaller, so without this a phone runs out after a few answers.
 */
function release(output) {
  for (const value of Object.values(output ?? {})) {
    if (typeof value?.dispose === "function") value.dispose();
    else if (value && typeof value === "object") release(value);
  }
}

/** Log-probabilities of each token of `ids` (then the end), given the encoded audio. */
async function tokenScores(encoder_outputs, start, ids) {
  const end = asr.model.generation_config.eos_token_id;
  const all = [...start, ...ids, end];
  const decoder_input_ids = new Tensor("int64", BigInt64Array.from(all.map(BigInt)), [1, all.length]);
  const output = await asr.model({ encoder_outputs, decoder_input_ids });
  try {
    const { logits } = output;
    const vocab = logits.dims[2];
    const data = logits.data;
    const scores = [];
    for (let i = start.length; i < all.length; i++) {
      const row = (i - 1) * vocab;
      let max = -Infinity;
      for (let v = 0; v < vocab; v++) if (data[row + v] > max) max = data[row + v];
      let sum = 0;
      for (let v = 0; v < vocab; v++) sum += Math.exp(data[row + v] - max);
      scores.push(data[row + all[i]] - max - Math.log(sum));
    }
    return scores;
  } finally {
    release(output);
  }
}

/** Token scores grouped into words (a token starting with a space starts a word; punctuation is left out). */
function wordScores(ids, scores) {
  const words = [];
  ids.forEach((id, i) => {
    const piece = asr.tokenizer.decode([id]);
    if (/^\s*[.,!?;:…"'()-]+\s*$/.test(piece)) return;
    if (/^\s/.test(piece) || !words.length) words.push({ text: piece.trim(), scores: [scores[i]] });
    else words.at(-1).text += piece, words.at(-1).scores.push(scores[i]);
  });
  const round = (x) => Math.round(x * 100) / 100;
  return words.map((w) => ({ text: w.text, min: round(Math.min(...w.scores)), mean: round(w.scores.reduce((a, b) => a + b, 0) / w.scores.length) }));
}

function recased(sentence, heard) {
  const bare = (word) => word.replace(/[^\p{L}\p{M}\p{N}\u200C\u200D']/gu, "");
  const written = new Map(heard.split(/\s+/).map((word) => [bare(word).toLowerCase(), bare(word)]));
  return sentence.replace(/[\p{L}\p{M}\p{N}\u200C\u200D']+/gu, (word) => written.get(word.toLowerCase()) || word);
}

const total = (scores) => Math.round(scores.reduce((a, b) => a + b, 0) * 100) / 100;

/**
 * Which of some languages Whisper hears: what its decoder scores after <|startoftranscript|>, where a language's own token
 * comes, as shares among those languages (OpenAI's detect_language, narrowed to the ones it may be).
 */
async function hearLanguage(encoder_outputs, codes) {
  const config = asr.model.generation_config;
  const known = codes.map((code) => [code, config.lang_to_id?.[`<|${code}|>`]]).filter(([, id]) => id !== undefined);
  const decoder_input_ids = new Tensor("int64", BigInt64Array.from([BigInt(config.decoder_start_token_id)]), [1, 1]);
  const output = await asr.model({ encoder_outputs, decoder_input_ids });
  try {
    const { logits } = output;
    const top = Math.max(...known.map(([, id]) => logits.data[id]));
    const raw = known.map(([code, id]) => [code, Math.exp(logits.data[id] - top)]);
    const sum = raw.reduce((n, [, v]) => n + v, 0);
    return Object.fromEntries(raw.map(([code, v]) => [code, Math.round((v / sum) * 1000) / 1000]));
  } finally {
    release(output);
  }
}

async function recognise(audio, language, sentences, detect) {
  const { input_features } = await asr.processor(audio);
  const generation_config = asr.model.generation_config;
  // Encode once; the transcript and every score reuse it.
  const { encoder_outputs } = await asr.model._prepare_encoder_decoder_kwargs_for_generation({
    inputs_tensor: input_features,
    model_inputs: { input_features, decoder_input_ids: [startTokens(language)] },
    model_input_name: "input_features",
    generation_config,
  });
  try {
    const end = generation_config.eos_token_id;
    const writeDown = async (code) => {
      const generated = await asr.model.generate({ inputs: input_features, encoder_outputs, language: code, task: "transcribe", max_new_tokens: 96 });
      // Text tokens only (every special token sits at or above the end token).
      const heardIds = Array.from(generated.data ?? generated.tolist?.()[0] ?? [], Number).filter((t) => t < end);
      const start = startTokens(code);
      return { code, start, heardIds, text: asr.tokenizer.decode(heardIds, { skip_special_tokens: true }).trim(), heardScores: await tokenScores(encoder_outputs, start, heardIds) };
    };
    const mean = (one) => (one.heardScores.length ? one.heardScores.reduce((a, b) => a + b, 0) / one.heardScores.length : -Infinity);
    let shares = null;
    let written;
    let both = null;
    if (detect?.length) {
      shares = await hearLanguage(encoder_outputs, detect);
      const ranked = Object.keys(shares).sort((a, b) => shares[b] - shares[a]);
      both = [];
      for (const code of ranked) both.push(await writeDown(code));
      written = both[0];
    } else written = await writeDown(language);
    const { start, heardIds, text, heardScores } = written;
    const scored = [];
    // Each sentence as given, and written with Whisper's capitals where the words agree ("Oma", not "oma"), so a
    // capital letter doesn't count against you.
    const candidates = [...new Set(sentences.flatMap((sentence) => [sentence, recased(sentence, text)]))];
    for (const sentence of candidates) {
      const ids = asr.tokenizer.encode(` ${sentence.trim()}`, { add_special_tokens: false });
      const scores = await tokenScores(encoder_outputs, start, ids);
      scored.push({ text: sentence, lp: total(scores), tokens: scores.length, words: wordScores(ids, scores) });
    }
    return { text, heard: { lp: total(heardScores), tokens: heardScores.length, words: wordScores(heardIds, heardScores) }, scored, ...(shares ? { language: written.code, shares, written: both.map((one) => ({ language: one.code, text: one.text, mean: Math.round(mean(one) * 100) / 100 })) } : {}) };
  } finally {
    release({ encoder_outputs });
  }
}

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      const started = performance.now();
      const device = await load(message.model, message.device);
      self.postMessage({ type: "loaded", id: message.id, device, ms: Math.round(performance.now() - started) });
    } else if (message.type === "transcribe") {
      if (!asr) throw Object.assign(new Error("The speech model isn't loaded."), { code: "model-missing" });
      const started = performance.now();
      const result = await recognise(message.audio, message.language ?? "nl", message.score ?? [], message.detect);
      self.postMessage({ type: "text", id: message.id, ...result, ms: Math.round(performance.now() - started) });
    }
  } catch (error) {
    const code = error?.code ?? "model-failed";
    self.postMessage({ type: "error", id: message.id, code, message: String(error?.message ?? error) });
  }
};
