// The Whisper models the app can run on your device, and the WebAssembly runtime that runs them. One list for the app
// and for scripts/speech-build.mjs, which downloads each model at its pinned revision and splits it into the chunks
// the site serves (/models/<id>/).
//
// Weights: OpenAI's Whisper (MIT license), converted to ONNX by onnx-community on Hugging Face. Runtime: ONNX Runtime
// Web (MIT), the build transformers.js 4.3.1 bundles.

export const ORT_VERSION = "1.31.0-dev.20260914-8d85527a0";

// The runtime's two builds: "asyncify" runs WebGPU and plain WebAssembly; "plain" is for Safari before 26 without
// WebGPU, where transformers.js avoids the asyncify build too.
export const RUNTIMES = {
  asyncify: { pack: "ort-asyncify", mjs: "/vendor/ort/ort-wasm-simd-threaded.asyncify.mjs", wasm: "ort-wasm-simd-threaded.asyncify.wasm" },
  plain: { pack: "ort-plain", mjs: "/vendor/ort/ort-wasm-simd-threaded.mjs", wasm: "ort-wasm-simd-threaded.wasm" },
};

// The libraries the worker imports, kept on the device with the model (the service worker files them in the same
// cache), so the recognizer works offline once it's downloaded.
export const LIBRARIES = [
  "/vendor/transformers/transformers.min.js",
  "/vendor/ort/ort-wasm-simd-threaded.asyncify.mjs",
  "/vendor/ort/ort-wasm-simd-threaded.mjs",
];

const safariBefore26 = () => {
  const match = /Version\/(\d+)[.\d]* (Mobile\/\S+ )?Safari/.exec(globalThis.navigator?.userAgent ?? "");
  return Boolean(match) && Number(match[1]) < 26;
};

export function runtimeFor(device) {
  return device === "wasm" && safariBefore26() ? RUNTIMES.plain : RUNTIMES.asyncify;
}

// Files every Whisper model needs besides its two ONNX graphs.
const CONFIG_FILES = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json"];

// Measured on the starter deck (26 sentences in two ElevenLabs voices, 28 single words, 26 wrong word orders), in
// Chrome on an M-series Mac: see the speech section of docs/speech.md.
export const MODELS = [
  {
    id: "whisper-turbo",
    name: "Best",
    about: "Whisper large-v3-turbo. The most accurate, and the only one that hears a wrong word order exactly as you said it. Needs WebGPU.",
    repo: "onnx-community/whisper-large-v3-turbo",
    revision: "360ebcde2559d60bb474678be3c1de9ef347d01a",
    devices: ["webgpu"],
    needsF16: true,
    dtype: { webgpu: { encoder_model: "q4f16", decoder_model_merged: "q4f16" } },
  },
  {
    id: "whisper-small",
    name: "Smaller",
    about: "Whisper small. About half the download and twice as fast; good on whole sentences, weaker on single words. Needs WebGPU.",
    repo: "onnx-community/whisper-small",
    revision: "36050c46d777d46dc4b5f43f6d90574fc38f8732",
    devices: ["webgpu"],
    needsF16: false,
    dtype: { webgpu: { encoder_model: "q4", decoder_model_merged: "q4" } },
  },
  {
    id: "whisper-base",
    name: "Basic",
    about: "Whisper base. For devices without WebGPU, where it runs on the processor: slower, and it mishears more.",
    repo: "onnx-community/whisper-base",
    revision: "1846881b6b3a3024392c1eea3ad983695bc23925",
    devices: ["webgpu", "wasm"],
    needsF16: false,
    dtype: { webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" }, wasm: { encoder_model: "fp32", decoder_model_merged: "q4" } },
  },
];

const SUFFIX = { fp32: "", fp16: "_fp16", q4: "_q4", q4f16: "_q4f16", q8: "_quantized", int8: "_int8" };

/** The files a model needs for a device, as paths in its Hugging Face repo. */
export function modelFiles(model, device = model.devices[0]) {
  const dtype = model.dtype[device];
  return [...CONFIG_FILES, ...Object.entries(dtype).map(([graph, type]) => `onnx/${graph}${SUFFIX[type]}.onnx`)];
}

/** Every file a model's pack holds (all of its devices). */
export function packFiles(model) {
  return [...new Set(model.devices.flatMap((device) => modelFiles(model, device)))];
}

export const modelById = (id) => MODELS.find((model) => model.id === id) ?? null;
