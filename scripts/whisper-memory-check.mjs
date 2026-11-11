// Whisper's GPU memory, in Chrome: a decoder pass's tensors stay on the GPU until they're disposed, and nothing collects them, so
// every spoken answer used to leave hundreds of MB behind until the GPU process died (4 Nov 2026: 59 GB of swap on a Mac). This
// counts the worker's live GPU buffer bytes (its createBuffer and destroy, wrapped from outside, so the app has no hook for it)
// across answers fed directly, with no microphone: transcribing alone, as dictation does; with a language to detect, as Translate
// does; and scored against the expected sentence, as Say it does. After a few answers to warm up, live bytes must stop growing,
// and every answer must still come out the same. It stops early, as a failure, if live bytes pass a ceiling.
// LOCAL or any server with the model files. Runs through gpu.py's queue. Nothing is played.
// Usage: node scripts/whisper-memory-check.mjs http://localhost:<port> <outDir> [--model whisper-small] [--answers 20]   (exit 0 = pass)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const [BASE, outArg] = args;
const OUT = outArg && resolve(outArg);
const MODEL = option("--model", "whisper-small");
const ANSWERS = Number(option("--answers", "20"));
const WARM = 5; // the runtime's own pool of buffers fills in the first few
const GROWTH_MB = 64; // what's allowed after that, in all
const CEILING_MB = 4096; // stop here: a leak has been shown, and there's no need to fill the machine
const FLOOR_GB = 50;
if (!/^https?:\/\//.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/whisper-memory-check.mjs http://localhost:<port> <outDir> [--model whisper-small] [--answers 20]");
  process.exit(2);
}
const freeGb = () => Number(execFileSync("df", ["-g", "/System/Volumes/Data"], { encoding: "utf8" }).trim().split("\n")[1].split(/\s+/)[3]);
if (freeGb() < FLOOR_GB) {
  console.error(`whisper-memory-check: under ${FLOOR_GB} GB free on the disk: not running`);
  process.exit(3);
}
mkdirSync(OUT, { recursive: true });

// In the worker, before anything of its own: every GPU buffer made and destroyed, and a way to ask. Dropped from the page's side
// on a BroadcastChannel, since the worker's own messages are the app's.
const COUNT = `
const __gpu = { live: 0, peak: 0, made: 0 };
const __sizes = new WeakMap();
const __create = GPUDevice.prototype.createBuffer;
GPUDevice.prototype.createBuffer = function (descriptor) {
  const buffer = __create.call(this, descriptor);
  __sizes.set(buffer, descriptor.size);
  __gpu.live += descriptor.size;
  __gpu.made++;
  __gpu.peak = Math.max(__gpu.peak, __gpu.live);
  return buffer;
};
const __destroy = GPUBuffer.prototype.destroy;
GPUBuffer.prototype.destroy = function () {
  if (__sizes.has(this)) {
    __gpu.live -= __sizes.get(this);
    __sizes.delete(this);
  }
  return __destroy.call(this);
};
const __channel = new BroadcastChannel("gpu-check");
__channel.onmessage = () => __channel.postMessage({ ...__gpu });
`;

const PROFILE = join(OUT, "profile");
rmSync(PROFILE, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(PROFILE, { headless: true, channel: "chrome", args: ["--enable-unsafe-webgpu"] });
let counted = false;
await context.route("**/js/speech/whisper-worker.js*", async (route) => {
  const response = await route.fetch();
  counted = true;
  await route.fulfill({ response, body: COUNT + (await response.text()) });
});
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const results = [];
let failed = 0;
const stage = async (name, fn) => {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ name, ok: false, note: String(error.message ?? error) });
    console.log(`FAIL  ${name}: ${error.message}`);
  }
};
const mb = (bytes) => Math.round(bytes / 1048576);

await page.goto(`${BASE}/design/`);
await page.waitForLoadState("load");
const manifest = JSON.parse(readFileSync(join(resolve(import.meta.dirname, ".."), "public/audio/starter-word-order/manifest.json"), "utf8"));
const CLIP = manifest.voices.emma.items["boek-gelezen"];
const EXPECTED = "Ik heb gisteren een boek gelezen.";

await stage(`${MODEL} loads on WebGPU, with its buffers counted`, async () => {
  const ready = await page.evaluate(async (model) => {
    const speech = await import("/js/speech/speech.js");
    if ((await speech.modelState(model)).state !== "ready") await speech.downloadModel(model);
    return speech.prepare({ engine: "whisper", model });
  }, MODEL);
  if (ready.device !== "webgpu") throw new Error(`on ${ready.device}`);
  if (!counted) throw new Error("the worker's script was never fetched through the route, so nothing is counted");
  return `on ${ready.device}`;
});

/** `answers` answers with these options; live bytes after each, and what came out. */
const run = (options) =>
  page.evaluate(
    async ({ src, options, answers, ceiling }) => {
      const whisper = await import("/js/speech/whisper.js");
      const { decodeTo16k } = await import("/js/speech/mic.js");
      const audio = await decodeTo16k(await (await fetch(`/audio/starter-word-order/${src}`)).arrayBuffer());
      const ask = () =>
        new Promise((done, fail) => {
          const channel = new BroadcastChannel("gpu-check");
          const timer = setTimeout(() => fail(new Error("the worker didn't answer: is it counting?")), 5000);
          channel.onmessage = (event) => {
            clearTimeout(timer);
            channel.close();
            done(event.data);
          };
          channel.postMessage("ask");
        });
      const out = [];
      for (let i = 0; i < answers; i++) {
        const t = performance.now();
        const r = await whisper.transcribeWhisper(audio.slice(), options);
        const gpu = await ask();
        out.push({ text: r.text, scored: (r.scored ?? []).map((s) => s.lp), live: gpu.live, peak: gpu.peak, ms: Math.round(performance.now() - t) });
        if (gpu.live > ceiling) break;
      }
      return out;
    },
    { src: CLIP.src, options, answers: ANSWERS, ceiling: CEILING_MB * 1048576 },
  );

const judged = (name, options) =>
  stage(name, async () => {
    const out = await run(options);
    writeFileSync(join(OUT, `${name.split(":")[0].replace(/\W+/g, "-")}.json`), JSON.stringify(out, null, 1));
    const lives = out.map((r) => mb(r.live));
    const line = `live MB ${lives.slice(0, 3).join(", ")} … ${lives.at(-1)} after ${out.length} answers; ${out[0].ms}–${out.at(-1).ms} ms`;
    if (out.length < ANSWERS) throw new Error(`over the ceiling of ${CEILING_MB} MB after ${out.length} answers (${line})`);
    const growth = lives.at(-1) - lives[WARM - 1];
    const each = Math.round(growth / (out.length - WARM));
    if (growth > GROWTH_MB) throw new Error(`grew ${growth} MB after the first ${WARM}, about ${each} MB an answer (${line})`);
    const texts = new Set(out.map((r) => r.text));
    if (texts.size !== 1) throw new Error(`answers changed: ${[...texts].join(" | ")}`);
    const scores = new Set(out.map((r) => JSON.stringify(r.scored)));
    if (scores.size !== 1) throw new Error(`scores changed: ${[...scores].slice(0, 3).join(" | ")}`);
    return `${line}; said "${[...texts][0]}"`;
  });

await judged("transcribing alone: as dictation does", { language: "nl", score: [] });
await judged("with a language to detect: as Translate does", { language: "nl", score: [], detect: ["nl", "en"] });
await judged("scored against the expected sentence: as Say it does", { language: "nl", score: [EXPECTED] });
await stage("no page errors", () => {
  if (errors.length) throw new Error(errors.slice(0, 3).join(" | "));
});

await context.close().catch(() => {});
rmSync(PROFILE, { recursive: true, force: true });
writeFileSync(join(OUT, "whisper-memory-check.json"), JSON.stringify(results, null, 1));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
