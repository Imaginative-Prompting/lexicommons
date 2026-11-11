// The page's audio session after a celebration, in Chromium and WebKit (lx/audio-session.js): the summary's sound plays (lx/sound.js), then
// a sentence plays through voice.js's own element and the device's voice, and at the moment each starts the session must not be
// "ambient" (on an iPhone, ambient makes a recording follow the silent switch: on 5 Nov 2026 every recording after a first
// finished lesson played nothing). Then the microphone (Chromium's stand-in device): play-and-record while it's open, auto after.
// Neither browser has Safari's Audio Session API, so the page gets a stand-in that keeps the type and logs every set. The app's
// own files are served by the check itself (no server needed); nothing is heard (quiet-browser.mjs).
// node scripts/audio-session-check.mjs <outDir> [--engines chromium,webkit] [--app <app dir>]   (exit 0 = pass; 2 = didn't reach a stage)
// Through gpu.py's parallel lane, from the channel repo root:
//   python3 pipelines/lyric-video/tools/gpu.py run --who <you> --label "audio session check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/audio-session-check.mjs <outDir>

import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "./quiet-browser.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outArg = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!outArg) {
  console.error("usage: audio-session-check.mjs <outDir> [--engines chromium,webkit] [--app <app dir>]");
  process.exit(64);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const APP = resolve(flag("--app", join(fileURLToPath(import.meta.url), "../..")));
const PUBLIC = join(APP, "public");
const ENGINES = flag("--engines", "chromium,webkit").split(",");

const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".html": "text/html", ".mp3": "audio/mpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const PAGE = "<!doctype html><meta charset=utf-8><title>audio session check</title><body></body>";
// The app's files, as they are; anything else (the API) a 404, as an app offline would meet.
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/check.html") return res.writeHead(200, { "content-type": "text/html" }).end(PAGE);
  const file = normalize(join(PUBLIC, path));
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
  try {
    if (!statSync(file).isFile()) throw new Error();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// Before the app's code: Safari's Audio Session API, stood in; what the session was when each sound started, the effects' as lx/sound.js
// tells them.
const STAND_IN = () => {
  const log = (window.__session = { sets: [], at: [] });
  let type = "auto";
  Object.defineProperty(navigator, "audioSession", {
    configurable: true,
    value: {
      get type() {
        return type;
      },
      set type(value) {
        log.sets.push(value);
        type = value;
      },
      get state() {
        return "inactive";
      },
    },
  });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    log.at.push({ sound: "media element", src: this.src, type });
    return play.call(this);
  };
  const speech = window.speechSynthesis;
  if (speech) {
    const speak = speech.speak.bind(speech);
    speech.speak = (utterance) => {
      log.at.push({ sound: "device voice", text: utterance?.text ?? "", type });
      return speak(utterance);
    };
  }
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const Real = window[name];
    if (typeof Real !== "function") continue;
    const osc = Real.prototype.createOscillator;
    Real.prototype.createOscillator = function () {
      log.at.push({ sound: "web audio note", type });
      return osc.call(this);
    };
  }
  addEventListener("lx-sound", (event) => log.at.push({ sound: "effect", role: event.detail.role, played: event.detail.played, why: event.detail.why, type }));
};

let failed = 0;
let unreached = 0;
const results = {};
const check = (engine, ok, what) => {
  console.log(`${engine} ${ok ? "ok  " : "FAIL"} ${what}`);
  (results[engine] ??= []).push({ ok, what });
  if (!ok) failed++;
};

for (const engine of ENGINES) {
  const kind = engine === "webkit" ? webkit : chromium;
  const launch = engine === "chromium" ? { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } : {};
  const browser = await kind.launch(launch);
  try {
    const context = await browser.newContext();
    await context.addInitScript(STAND_IN);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${BASE}/check.html`);
    // A celebration, then a sentence: the summary's sound through lx/sound.js after a press (it makes its context in the first one, as
    // on a phone), then voice.js's element and the device's voice (unlockAudio plays both, as the first press anywhere does).
    await page.evaluate(async () => {
      await import("/js/lx/sound.js");
      await import("/js/study/voice.js");
    });
    await page.mouse.click(5, 5);
    const run = await page.evaluate(async () => {
      const { play, loadSounds } = await import("/js/lx/sound.js");
      const voice = await import("/js/study/voice.js");
      await loadSounds();
      play("day-counted", { afterSpeech: true });
      // It waits a turn and for anything being said, then plays.
      const until = Date.now() + 3000;
      while (!window.__session.at.some((s) => s.sound === "effect" && s.role === "day-counted") && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
      const afterChime = navigator.audioSession.type;
      voice.unlockAudio();
      await new Promise((r) => setTimeout(r, 300));
      return { afterChime, log: window.__session };
    });
    const effect = run.log.at.find((s) => s.sound === "effect" && s.role === "day-counted");
    if (!effect?.played) {
      console.log(`${engine} DIDN'T REACH the celebration's sound (${effect ? effect.why : "not asked"}): nothing to check after it`);
      unreached++;
      continue;
    }
    check(engine, effect.type !== "ambient", `the celebration's sound played, the session ${effect.type}`);
    const media = run.log.at.filter((s) => s.sound === "media element");
    const voice = run.log.at.filter((s) => s.sound === "device voice");
    if (!media.length) {
      console.log(`${engine} DIDN'T REACH voice.js's element after the celebration`);
      unreached++;
    } else check(engine, media.every((s) => s.type !== "ambient"), `voice.js's element after the celebration: session ${media.map((s) => s.type).join(", ")} (never ambient)`);
    if (voice.length) check(engine, voice.every((s) => s.type !== "ambient"), `the device's voice after the celebration: session ${voice.map((s) => s.type).join(", ")} (never ambient)`);
    check(engine, !run.log.sets.includes("ambient"), `nothing set the session to ambient (sets: ${run.log.sets.join(", ") || "none"})`);
    check(engine, run.afterChime === "auto", `the session after the celebration: ${run.afterChime}`);
    // The microphone: play-and-record while open, auto once let go (Chromium's stand-in device; WebKit headless has none).
    if (engine === "chromium") {
      const mic = await page.evaluate(async () => {
        const { openMic, releaseMic } = await import("/js/speech/mic.js");
        let open = null;
        try {
          const stream = await openMic();
          open = navigator.audioSession.type;
          releaseMic(stream);
        } catch (error) {
          return { error: String(error) };
        }
        return { open, after: navigator.audioSession.type };
      });
      if (mic.error) {
        console.log(`${engine} DIDN'T REACH the microphone: ${mic.error}`);
        unreached++;
      } else {
        check(engine, mic.open === "play-and-record", `the microphone open: ${mic.open}`);
        check(engine, mic.after === "auto", `the microphone let go: ${mic.after}`);
      }
    }
    check(engine, errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  } finally {
    await browser.close();
  }
}
server.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(failed ? `${failed} failed` : unreached ? `${unreached} stage(s) not reached` : "all passed");
process.exit(failed ? 1 : unreached ? 2 : 0);
