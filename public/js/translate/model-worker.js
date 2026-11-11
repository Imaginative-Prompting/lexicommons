// The full translator, off the page (translate/translator.js is the page's side): Mozilla's bergamot runtime (MPL-2.0,
// public/vendor/bergamot/) and its models, called as Firefox calls them, as the phone test measured them on an iPhone
// (5 Nov 2026: about 12 ms a sentence, a 205 MB heap a way, 304 MB both). Files come from this device's copy
// (Cache Storage, translate/models.js CACHE) or are downloaded, checked against their sha256 and only then kept.
// A classic worker: bergamot is an importScripts runtime.

importScripts("/vendor/bergamot/bergamot-translator.js");

const MB = 1e6;
let CACHE = "lx-translator-v1";
let bergamot = null;
let service = null;
const models = new Map(); // "nl>en" → a TranslationModel
let stopping = null;

const say = (id, more) => postMessage({ id, ...more });
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function kept(file) {
  const response = await (await caches.open(CACHE)).match(file.url);
  return response ? new Uint8Array(await response.arrayBuffer()) : null;
}

// One file over the network, its bytes counted as they come (onBytes), checked, then kept. A file that isn't the one
// listed is never kept.
async function fetchFile(file, onBytes, signal) {
  const response = await fetch(file.url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} for ${file.name}`);
  const reader = response.body.getReader();
  const parts = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    onBytes(value.length);
  }
  const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
  const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
  if (digest !== file.sha256) throw new Error(`${file.name} isn't the file it should be`);
  await (await caches.open(CACHE)).put(file.url, new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }));
  return bytes;
}

// The runtime, started once: every way asking at the same time waits on the same start (and a start that failed
// lets the next ask try again).
let starting = null;
function runtime(wasm) {
  starting ??= start(wasm).catch((error) => {
    starting = null;
    throw error;
  });
  return starting;
}
async function start(wasm) {
  const bytes = (await kept(wasm)) ?? (await fetchFile(wasm, () => {}, undefined));
  bergamot = await new Promise((resolve, reject) => {
    const module = loadBergamot({
      wasmBinary: bytes.buffer,
      print: () => {},
      printErr: () => {},
      onAbort: (error) => reject(new Error(`the translator stopped: ${error}`)),
      onRuntimeInitialized: async () => {
        await Promise.resolve();
        resolve(module);
      },
    });
  });
  service = new bergamot.BlockingService({ cacheSize: 0 });
}

const CONFIG = Object.entries({ "beam-size": "1", normalize: "1.0", "word-penalty": "0", "max-length-break": "128", "mini-batch-words": "1024", workspace: "128", "max-length-factor": "2.0", "skip-cost": "true", "cpu-threads": "0", quiet: "true", "quiet-translation": "true", "gemm-precision": "int8shiftAlphaAll", alignment: "soft" })
  .map(([key, value]) => `${key}: ${value}`)
  .join("\n");

const OPS = {
  configure({ cache }) {
    CACHE = cache;
    return {};
  },
  /** Which of these files this device has. */
  async have({ files }) {
    const cache = await caches.open(CACHE);
    const here = [];
    for (const file of files) if (await cache.match(file.url)) here.push(file.url);
    return { here };
  },
  /** Every file not here yet, in turn, with progress in bytes; stop() ends it, keeping what came whole. */
  async download({ id, files }) {
    stopping = new AbortController();
    const signal = stopping.signal;
    const cache = await caches.open(CACHE);
    let got = 0;
    for (const file of files) {
      if (await cache.match(file.url)) {
        got += file.size;
        say(id, { got });
        continue;
      }
      let last = 0;
      await fetchFile(
        file,
        (n) => {
          got += n;
          if (got - last > MB / 2) {
            last = got;
            say(id, { got });
          }
        },
        signal,
      );
    }
    stopping = null;
    return { got };
  },
  stop() {
    stopping?.abort();
    return {};
  },
  /** A way's model in memory (the runtime first), from this device's copy; at most two ways at once. */
  async load({ way, wasm, files, from, to }) {
    if (models.has(way)) return {};
    await runtime(wasm);
    for (const [other, model] of models) {
      if (models.size < 2) break;
      model.delete();
      models.delete(other);
    }
    const aligned = async (file, align) => {
      const bytes = await kept(file);
      if (!bytes) throw new Error(`${file.name} isn't on this device`);
      const memory = new bergamot.AlignedMemory(bytes.byteLength, align);
      memory.getByteArrayView().set(bytes);
      return memory;
    };
    const vocabs = new bergamot.AlignedMemoryList();
    vocabs.push_back(await aligned(files.vocab, 64));
    models.set(way, new bergamot.TranslationModel(from, to, `\n${CONFIG}\n`, await aligned(files.model, 256), await aligned(files.lex, 64), vocabs, null));
    return {};
  },
  translate({ way, text }) {
    const model = models.get(way);
    if (!model) throw new Error(`${way} isn't loaded`);
    const messages = new bergamot.VectorString();
    const options = new bergamot.VectorResponseOptions();
    messages.push_back(text);
    options.push_back({ qualityScores: false, alignment: false, html: false });
    const responses = service.translate(model, messages, options);
    const out = responses.get(0).getTranslatedText();
    responses.delete();
    messages.delete();
    options.delete();
    return { out };
  },
  /** A language's files off this device, its ways out of memory. */
  async remove({ files, ways }) {
    for (const way of ways) {
      models.get(way)?.delete();
      models.delete(way);
    }
    const cache = await caches.open(CACHE);
    for (const file of files) await cache.delete(file.url);
    return {};
  },
};

// Loading and removing go one at a time: each changes which models are in memory, and two at once would each read what
// the other is changing. A download (stopped any time) and a translation (a loaded way's, at once) don't wait.
let line = Promise.resolve();
const inTurn = (run) => {
  const turn = line.then(() => run());
  line = turn.catch(() => {});
  return turn;
};
const IN_TURN = new Set(["load", "remove"]);

onmessage = async ({ data }) => {
  const { id, op } = data;
  try {
    say(id, { done: true, ...(await (IN_TURN.has(op) ? inTurn(() => OPS[op](data)) : OPS[op](data))) });
  } catch (error) {
    say(id, { done: true, error: String(error?.name === "AbortError" ? "stopped" : (error?.message ?? error)).slice(0, 300) });
  }
};
