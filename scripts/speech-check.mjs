// Checks speaking end to end in headless Chrome, through the real microphone path: Chrome's fake microphone plays a
// recording into getUserMedia (never out loud), and the app's speech module (public/js/speech/) listens to it with
// each recognizer and checks it against the sentence. Every listen starts from a real click, as in the app.
//
//   1. download: each Whisper model from the site into a fresh profile, with progress; the chunks land in the speech
//      cache, never the service worker's shell cache
//   2. listen: each recording through each recognizer. Right sentences must pass, and a wrong sentence (word order
//      or word) must never pass. How often a wrong order is named as an order slip is reported, as are accented
//      recordings (a stand-in for a learner, not judged).
//   3. the /design demo, by its buttons: download with progress, stop, finish, listen, remove (screenshots)
//   4. no console errors and no CSP violations anywhere
//
// Usage (headless Chrome, so through the channel's GPU queue, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "speech check" --kind stills -- \
//     node 08-lexicommons/app/scripts/speech-check.mjs <baseUrl> <outDir> [--models whisper-turbo,whisper-small]
//     [--browser] [--set quick|full|demo] [--extra <index.json>]   (demo: downloads and the /design demo only)
// baseUrl: a local `wrangler dev` (with GATE_ENABLED:false) or https://lexicommons.com (the gate is passed with the
// Keychain password). Nothing is signed in or written to the server. --extra adds recordings kept outside the repo:
// an index.json of [{ file, expected, said, kind: "right" | "order" | "word" | "accent" }].

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const args = process.argv.slice(2);
const [BASE = "http://localhost:8791", OUT = "speech-check-out"] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--models") && !args[i - 1]?.startsWith("--set") && !args[i - 1]?.startsWith("--extra"));
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const MODELS = option("--models", "whisper-turbo,whisper-small").split(",").filter(Boolean);
const BROWSER = args.includes("--browser");
const SET = option("--set", "quick");
const EXTRA = option("--extra", null);
const APP = resolve(import.meta.dirname, "..");
mkdirSync(join(OUT, "wav"), { recursive: true });

// ---------- recordings ----------

const content = await import(join(APP, "public/js/study/content.js"));
const sentence = Object.fromEntries(content.ITEMS.map((item) => [item.id, item.words.map((w) => w[0]).join(" ") + item.punct]));
const manifest = JSON.parse(readFileSync(join(APP, "public/audio/starter-word-order/manifest.json"), "utf8"));
const wrongOrders = JSON.parse(readFileSync(join(APP, "scripts/fixtures/wrong-orders/index.json"), "utf8")).clips;

const clips = [];
const QUICK_RIGHT = ["emma/boek-gelezen", "ido/morgen-oma", "emma/weet-komt", "ido/winkel-brood", "emma/raam-opendoen", "ido/wat-eet"];
const QUICK_ORDER = ["boek-gelezen-wrong-1", "hoe-gaat-wrong-1", "bel-op-wrong-1", "zie-niet-wrong-2"];
// The /design demo listens to this one.
const DEMO_CLIP = { name: "emma-boek-gelezen", kind: "right", file: join(APP, "public/audio/starter-word-order", manifest.voices.emma.items["boek-gelezen"].src), expected: sentence["boek-gelezen"], said: manifest.voices.emma.items["boek-gelezen"].text };
for (const voice of ["emma", "ido"]) {
  for (const [id, item] of Object.entries(manifest.voices[voice].items)) {
    if (SET === "demo" || (SET === "quick" && !QUICK_RIGHT.includes(`${voice}/${id}`))) continue;
    clips.push({ name: `${voice}-${id}`, kind: "right", file: join(APP, "public/audio/starter-word-order", item.src), expected: sentence[id], said: item.text });
  }
}
for (const clip of wrongOrders) {
  if (SET === "demo" || (SET === "quick" && !QUICK_ORDER.includes(clip.file.replace(/\.mp3$/, "")))) continue;
  clips.push({ name: clip.file.replace(/\.mp3$/, ""), kind: "order", file: join(APP, "scripts/fixtures/wrong-orders", clip.file), expected: sentence[clip.item], said: clip.text });
}
if (EXTRA) {
  for (const clip of JSON.parse(readFileSync(EXTRA, "utf8"))) clips.push({ ...clip, name: clip.name ?? clip.file.split("/").pop().replace(/\.\w+$/, ""), file: resolve(dirname(EXTRA), clip.file) });
}

// The fake microphone takes a WAV: 48 kHz mono, with 0.6 s of quiet before the speech and 2.5 s after, as a person
// would leave. It loops, so the quiet after is what ends the recording.
for (const clip of [...clips, DEMO_CLIP]) {
  clip.wav = resolve(OUT, "wav", `${clip.name}.wav`);
  if (!existsSync(clip.wav)) execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", clip.file, "-af", "adelay=600:all=1,apad=pad_dur=2.5", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", clip.wav]);
}

// ---------- the browser ----------

const results = [];
const problems = [];
let failed = 0;
function record(stage, ok, detail) {
  results.push({ stage, ok, ...detail });
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${stage}${detail?.note ? `: ${detail.note}` : ""}`);
}

const PROFILE = resolve(OUT, "profile");
rmSync(PROFILE, { recursive: true, force: true });

async function launch(wav) {
  const flags = ["--enable-unsafe-webgpu", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
  if (wav) flags.push(`--use-file-for-fake-audio-capture=${wav}`);
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true, channel: "chrome", args: flags, viewport: { width: 1100, height: 900 } });
  await context.grantPermissions(["microphone"], { origin: new URL(BASE).origin });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  await page.goto(`${BASE}/design/`);
  if (page.url().includes("/_gate")) {
    const password = execFileSync("security", ["find-internet-password", "-s", "lexicommons.com", "-a", "site-gate", "-w"], { encoding: "utf8" }).trim();
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/design\/$/, { timeout: 15_000 });
  }
  await page.waitForLoadState("load");
  // CSP violations are reported as events, not always as console errors.
  await page.evaluate(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  return { context, page };
}

async function violations(page) {
  for (const v of await page.evaluate(() => window.__violations ?? [])) problems.push(`CSP: ${v}`);
}

// ---------- 1. download ----------

const downloads = {};
{
  const { context, page } = await launch(null);
  for (const model of MODELS) {
    const started = Date.now();
    const out = await page.evaluate(async (id) => {
      const speech = await import("/js/speech/speech.js");
      const progress = [];
      const before = await speech.modelState(id);
      try {
        await speech.downloadModel(id, { onProgress: (p) => progress.push(p.have) });
      } catch (error) {
        return { error: `${error.code}: ${error.message}` };
      }
      const after = await speech.modelState(id);
      const keys = {};
      for (const name of await caches.keys()) keys[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
      return { before, after, events: progress.length, monotonic: progress.every((v, i) => !i || v >= progress[i - 1]), keys };
    }, model);
    if (out.error) {
      record(`download ${model}`, false, { note: out.error });
      continue;
    }
    const shellHoldsModels = Object.entries(out.keys).some(([name, paths]) => name.startsWith("shell-") && paths.some((p) => p.startsWith("/models/")));
    const speechHolds = (out.keys["lx-speech-v1"] ?? []).filter((p) => p.startsWith(`/models/${model}/`)).length;
    downloads[model] = { ...out, seconds: (Date.now() - started) / 1000, keys: undefined };
    record(`download ${model}`, out.before.state === "absent" && out.after.state === "ready" && out.monotonic && out.events >= 2 && !shellHoldsModels && speechHolds > 0, {
      note: `${(out.after.total / 1e6).toFixed(0)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s, ${out.events} progress events, ${speechHolds} chunks in the speech cache${shellHoldsModels ? ", BUT the shell cache holds model files" : ""}`,
    });
  }
  await violations(page);
  await context.close();
}

// ---------- 2. listen ----------

async function listenOnce(clip, engine, model) {
  const { context, page } = await launch(clip.wav);
  // A real button, pressed for real: the AudioContext must start inside a press, as on an iPhone.
  await page.evaluate(({ expected, engine, model }) => {
    const button = document.createElement("button");
    button.id = "speech-check";
    button.textContent = "Listen";
    document.body.prepend(button);
    window.__states = [];
    window.__levels = 0;
    button.addEventListener("click", async () => {
      const speech = await import("/js/speech/speech.js");
      const listener = speech.listen({ engine, model, expected, lang: "nl-NL", onState: (s) => window.__states.push(s), onLevel: () => window.__levels++ });
      listener.done.then((result) => (window.__result = { result }), (error) => (window.__result = { error: `${error.code}: ${error.message}` }));
    });
  }, { expected: clip.expected, engine, model });
  const started = Date.now();
  await page.click("#speech-check");
  await page.waitForFunction(() => window.__result, null, { timeout: 60_000 }).catch(() => null);
  const out = await page.evaluate(() => ({ ...(window.__result ?? { error: "timed out" }), states: window.__states, levels: window.__levels }));
  out.seconds = (Date.now() - started) / 1000;
  await violations(page);
  await context.close();
  return out;
}

// Known limits: one recognizer on one clip, each saying what it does; never a blanket skip. Only that exact miss passes, as a note: anything
// else that recognizer does on that clip, and every other recognizer and clip, is judged as before.
// - whisper-small writes the familiar order for "Hoe het gaat met je" ("Hoe gaat het met je?"), so the slip never reaches the matcher, which
//   rightly passes the right order. whisper-turbo and the browser's recognizer write it as said, and the matcher names it (6 Nov 2026).
const KNOWN_LIMITS = [
  {
    label: "whisper-small",
    clip: "hoe-gaat-wrong-1",
    why: "whisper-small writes the familiar order, so the slip never reaches the matcher (turbo and the browser hear it)",
    // The miss as known: what it wrote is the expected sentence, every word right, as heard (no rescue).
    is: (m) => Boolean(m?.ok) && m.how === "heard" && m.words.every((w) => w.result === "right"),
  },
];

const engines = [...MODELS.filter((m) => downloads[m]).map((model) => ({ engine: "whisper", model, label: model })), ...(BROWSER ? [{ engine: "browser", model: null, label: "browser" }] : [])];
for (const { engine, model, label } of engines) {
  for (const clip of clips) {
    const out = await listenOnce(clip, engine, model);
    const m = out.result?.match;
    const words = m ? m.words.map((w) => `${w.text}:${w.result}${w.heard && w.result !== "right" ? `(${w.heard})` : ""}`).join(" ") : "";
    let ok;
    if (out.error) ok = false;
    else if (clip.kind === "right") ok = m.ok;
    else if (clip.kind === "order") ok = !m.ok;
    else if (clip.kind === "word") ok = !m.ok;
    else ok = true; // accent: reported, not judged
    const note = out.error ? `${clip.said} → ${out.error} [${out.states.join(" ")}]` : `${clip.said} → "${out.result.heard}" ${m.ok ? "passed" : "not passed"} (${m.how}${m.fit ? ` Δ${m.fit.delta}` : ""}) ${words} · ${out.result.ms?.thinking ?? "-"} ms thinking, ${out.seconds.toFixed(1)} s in all, states ${out.states.join(">")}, ${out.levels} levels`;
    const named = clip.kind === "order" ? m?.words.some((w) => w.result === "order") ?? false : null;
    const known = !ok && !out.error && clip.kind === "order" ? KNOWN_LIMITS.find((k) => k.label === label && k.clip === clip.name && k.is(m)) ?? null : null;
    if (known) ok = true;
    record(`${label} · ${clip.kind} · ${clip.name}`, ok, { note: `${note}${named === false ? " · order slip not named" : ""}${known ? ` · KNOWN LIMIT: ${known.why}` : ""}`, clip: { name: clip.name, kind: clip.kind, expected: clip.expected, said: clip.said }, out, named, known: known?.why ?? null });
  }
  const orders = results.filter((r) => r.stage.startsWith(`${label} · order`));
  if (orders.length) console.log(`      ${label}: named the order slip in ${orders.filter((r) => r.named).length} of ${orders.length} wrong orders`);
}

// ---------- 3. the /design demo ----------

if (MODELS.some((m) => downloads[m])) {
  const shots = join(OUT, "shots");
  mkdirSync(shots, { recursive: true });
  const clip = DEMO_CLIP;
  const { context, page } = await launch(clip.wav);
  const section = page.locator("#recognizers");
  const row = (name) => section.locator('[data-part="list-row"]').filter({ hasText: name });
  const shot = (name) => section.screenshot({ path: join(shots, `${name}.png`) });
  try {
    await section.getByText("The model that suits it").waitFor({ timeout: 15_000 });
    await section.scrollIntoViewIfNeeded();
    await section.getByText("to download, once").first().waitFor({ timeout: 15_000 });
    await shot("1-device-and-models");
    // Download the basic model through its button, stop it part way, then finish it.
    await row("whisper-base").getByRole("button", { name: "Download" }).click();
    await row("whisper-base").getByText("Downloading:").waitFor({ timeout: 10_000 });
    await shot("2-downloading");
    await row("whisper-base").getByRole("button", { name: "Stop" }).click();
    await row("whisper-base").getByText(/Part downloaded|On this device/).waitFor({ timeout: 10_000 });
    const stopped = await row("whisper-base").innerText();
    await shot("3-stopped");
    if (/Part downloaded/.test(stopped)) await row("whisper-base").getByRole("button", { name: "Finish" }).click();
    await row("whisper-base").getByText("On this device").waitFor({ timeout: 60_000 });
    await shot("4-downloaded");
    // Listen with the first checked model, by the demo's own microphone button.
    const name = { "whisper-turbo": "Best", "whisper-small": "Smaller" }[MODELS.find((m) => downloads[m])];
    await section.locator('[data-part="segmented"]').filter({ hasText: "Smaller" }).getByRole("button", { name, exact: true }).click();
    await section.locator('[data-part="mic-button"]').click();
    await section.locator('[data-part="said-line"]').waitFor({ timeout: 60_000 });
    await shot("5-result");
    const result = await section.locator('[data-part="feedback"]').first().innerText();
    // Remove the basic model again.
    await row("whisper-base").getByRole("button", { name: "Remove" }).click();
    await row("whisper-base").getByText("to download, once").waitFor({ timeout: 10_000 });
    record("the /design demo: download, stop, finish, listen, remove", /That's it/.test(result), { note: `stopped at "${stopped.split("\n")[1] ?? stopped}", then "${result.replace(/\s+/g, " ")}" for ${clip.said}; screenshots in ${shots}` });
  } catch (error) {
    await shot("failed").catch(() => {});
    record("the /design demo: download, stop, finish, listen, remove", false, { note: error.message.split("\n")[0] });
  }
  await violations(page);
  await context.close();
}

// ---------- 4. errors ----------

record("no console errors or CSP violations", problems.length === 0, { note: problems.length ? problems.slice(0, 8).join(" | ") : "none" });

writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, models: MODELS, browser: BROWSER, set: SET, downloads, results }, null, 1));
const table = results
  .filter((r) => r.clip)
  .map((r) => `| ${r.ok ? "ok" : "FAIL"} | ${r.stage.split(" · ")[0]} | ${r.clip.kind} | ${r.clip.said} | ${r.out.error ?? r.out.result.heard} | ${r.out.result?.match?.ok ?? "-"} | ${r.out.result?.match?.how ?? "-"} |`);
writeFileSync(
  join(OUT, "report.md"),
  `# Speech check\n\n${BASE}, ${new Date().toISOString()}\n\n${results.filter((r) => !r.clip).map((r) => `- ${r.ok ? "ok" : "FAIL"} ${r.stage}: ${r.note ?? ""}`).join("\n")}\n\n| | recognizer | kind | said | heard | passed | how |\n|---|---|---|---|---|---|---|\n${table.join("\n")}\n`,
);
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
