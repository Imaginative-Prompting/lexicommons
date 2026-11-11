// Which recognizer Translate's microphone gets, and what stops Whisper taking the app down twice. A stand-in for each thing a
// computer here can't be: an iPhone's Home Screen app (its user agent, navigator.standalone, Safari's recognizer: only the prefixed
// name, no available()), a model on the device (Cache Storage and its manifests), and Whisper's worker (it counts what it's asked and
// answers or hangs, so nothing heavy runs). The crash is real: the page's process is killed from outside with SIGKILL, as a phone's
// memory limit does, so no page event runs. A real phone's behavior isn't shown here: Safari's recognizer, its memory limit, a kill
// there. LOCAL only: it signs up a test account. Nothing is played, and no microphone is read but Chrome's fake one.
// Usage: node scripts/dictation-check.mjs http://localhost:<port> <outDir> [--only <name,name>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const ONLY = argv.includes("--only") ? new Set(argv[argv.indexOf("--only") + 1].split(",")) : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/dictation-check.mjs http://localhost:<port> <outDir> [--only <name,name>] (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const MIC = '.lx-today-translate [data-part="mic-button"]'; // in the box on Home, in the bar on the page
const FIELD = '[data-part="translate-field"] :is(textarea, input)';
const PAGE = ".lx-today-translate";
const OFFER = ".lx-tr-offer";
const SECONDS = 15_000;

// What Chrome's fake microphone hears: a second of tone and two of quiet, so a recording starts and ends by itself. Never played.
const SAID = `${OUT}/said.wav`;
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=300:duration=1", "-af", "apad=pad_dur=2", "-ar", "48000", "-ac", "1", SAID]);
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${SAID}`] });
const desk = await browser.newContext();
const signup = await desk.newPage();
const authn = await desk.newCDPSession(signup);
await authn.send("WebAuthn.enable");
await authn.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Dictation Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const COOKIES = await desk.cookies();
await signup.close();

// Everything a device is, before the app's first line runs. recognizer: safari | refuses | deaf | chrome | none. whisper: ok | hangs | hangs-thinking.
function device({ recognizer, whisper, standalone }) {
  if (standalone) Object.defineProperty(navigator, "standalone", { value: true });

  // Each pack's list of files, as the site serves it: 329 MB, in one chunk.
  const realFetch = window.fetch;
  window.fetch = (input, init) => {
    const url = String(input?.url ?? input);
    const pack = url.match(/\/models\/([^/]+)\/manifest\.json$/)?.[1];
    if (!pack) return realFetch(input, init);
    const bytes = 329 * 1048576;
    return Promise.resolve(Response.json({ format: "lexicommons-speech-pack", version: 1, bytes, files: [{ path: "model.onnx", chunks: [{ name: `${pack}-0`, bytes }] }] }));
  };

  // Whisper's worker: counts, and answers unless told not to. Any other worker is real.
  const RealWorker = window.Worker;
  window.lxWhisper = { spawned: 0, loads: 0, transcribes: 0, terminated: 0 };
  window.Worker = function Worker(url, options) {
    if (options?.name !== "lexicommons-whisper") return new RealWorker(url, options);
    window.lxWhisper.spawned++;
    const fake = {
      onmessage: null,
      onerror: null,
      terminate: () => window.lxWhisper.terminated++,
      postMessage(message) {
        const answer = (data) => setTimeout(() => fake.onmessage?.({ data: { ...data, id: message.id } }), 30);
        if (message.type === "load") {
          window.lxWhisper.loads++;
          if (whisper !== "hangs") answer({ type: "loaded", device: message.device, ms: 1 });
        } else if (message.type === "transcribe") {
          window.lxWhisper.transcribes++;
          if (whisper !== "hangs-thinking") answer({ type: "text", text: "het boek", heard: { lp: -1, tokens: 2, words: [] }, scored: [], ms: 1, language: "nl", shares: { nl: 1 }, written: [{ language: "nl", text: "het boek", mean: -0.1 }] });
        }
      },
    };
    return fake;
  };

  // The browser's recognizer: says what it's asked to listen in, and hears what the check says (window.lxSayIt).
  window.lxRecognizer = { langs: [] };
  const Stand = class {
    start() {
      window.lxRecognizer.langs.push(this.lang);
      // WebKit bug 321436's hang: it starts, and then there's no result, no error and no end, whatever's asked of it.
      if (recognizer === "deaf") return;
      if (recognizer === "refuses") {
        setTimeout(() => {
          this.onerror?.({ error: "service-not-allowed" });
          this.onend?.();
        }, 0);
        return;
      }
      setTimeout(() => this.onaudiostart?.(), 20);
      window.lxSayIt = (text) => {
        const result = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
        this.onend?.();
      };
    }
    stop() {
      if (recognizer !== "deaf") this.onend?.();
    }
    abort() {
      if (recognizer === "deaf") return;
      this.onerror?.({ error: "aborted" });
      this.onend?.();
    }
  };
  if (recognizer === "chrome") {
    Stand.available = async ({ processLocally }) => (processLocally ? "unavailable" : "available");
  }
  const has = recognizer !== "none";
  Object.defineProperty(window, "SpeechRecognition", { value: recognizer === "chrome" ? Stand : undefined, configurable: true, writable: true });
  Object.defineProperty(window, "webkitSpeechRecognition", { value: has ? Stand : undefined, configurable: true, writable: true });
}

const errors = [];
/** A device, signed in and on Today. model: the model's on it. engine: chosen in Settings. computer: no touch, a desk's screen. */
async function open({ userAgent = IPHONE, standalone = userAgent === IPHONE, recognizer = "safari", whisper = "ok", model = false, engine, computer = userAgent === MAC_SAFARI } = {}) {
  const context = await browser.newContext({ viewport: computer ? { width: 1200, height: 800 } : { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: !computer, hasTouch: !computer, userAgent });
  await context.addCookies(COOKIES);
  await context.grantPermissions(["microphone"], { origin: new URL(BASE).origin });
  await context.addInitScript(device, { recognizer, whisper, standalone });
  const one = { context, page: await context.newPage() };
  watch(one.page);
  await today(one.page);
  if (model) await one.page.evaluate(async () => {
    const cache = await caches.open("lx-speech-v1");
    for (const pack of ["whisper-small", "whisper-base", "whisper-turbo", "ort-asyncify", "ort-plain"]) await cache.put(new URL(`/models/${pack}/c/${pack}-0`, location.origin).href, new Response("x"));
  });
  if (engine) await one.page.evaluate(async (engine) => (await import("/js/study/settings.js")).setStudySetting("say.engine", engine), engine);
  return one;
}
const watch = (page) => page.on("pageerror", (e) => errors.push(String(e)));
async function today(page) {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.waitForSelector(FIELD, { timeout: 30_000 });
  // The speech module ahead of the press, as on the page after a moment.
  await page.evaluate(async () => {
    await (await import("/js/study/speaking.js")).speechApi();
  });
}
const again = async ({ context }) => {
  const page = await context.newPage();
  watch(page);
  await today(page);
  return page;
};
const press = (page) => page.locator(MIC).click();
const whisperCounts = (page) => page.evaluate(() => window.lxWhisper);
const heardIn = (page) => page.evaluate(() => window.lxRecognizer.langs);
const listened = (page, count = 1) => page.waitForFunction((count) => window.lxRecognizer.langs.length >= count, count, { timeout: SECONDS });
const whisperAsked = (page) => page.waitForFunction(() => window.lxWhisper.loads >= 1, null, { timeout: SECONDS });
const words = (page) => page.locator(PAGE).innerText();
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const noWhisper = async (page, because) => {
  const seen = await whisperCounts(page);
  assert(seen.spawned === 0 && seen.loads === 0, `${because}: Whisper was started (${JSON.stringify(seen)})`);
};
const noOffer = async (page, because) => {
  const text = await page.locator(OFFER).innerText().catch(() => "");
  assert(!/download/i.test(text), `${because}: Whisper's download was offered: ${text}`);
};
/** What it heard, written in the box, with the way it was listening. */
const hears = async (page, said) => {
  await page.waitForFunction(() => typeof window.lxSayIt === "function", null, { timeout: SECONDS });
  await page.evaluate((said) => window.lxSayIt(said), said);
  await page.waitForFunction(([field, said]) => document.querySelector(field)?.value === said, [FIELD, said], { timeout: SECONDS });
  return page.locator('[data-part="translate-direction"]').getAttribute("aria-label");
};
/** Kills the page's process with SIGKILL, as a phone's memory limit does: no event runs in it. All the renderers this check's own browser has running. */
async function kill(page) {
  const crashed = new Promise((done) => page.once("crash", done));
  const session = await browser.newBrowserCDPSession();
  const { processInfo } = await session.send("SystemInfo.getProcessInfo");
  await session.detach();
  const renderers = processInfo.filter((one) => one.type === "renderer").map((one) => one.id);
  assert(renderers.length, "no renderer to kill");
  for (const pid of renderers) process.kill(pid, "SIGKILL");
  await crashed;
}
const stopped = (page) => page.evaluate(async () => {
  const guard = await import("/js/speech/guard.js");
  await guard.guardReady;
  return guard.whisperStopped();
});
const speakingSettings = async (page) => {
  await page.evaluate(() => (location.hash = "#settings/study/speaking"));
  await page.waitForSelector('input[name="engine"][value="whisper"]', { state: "attached", timeout: SECONDS });
  return (await page.locator("main, body").first().innerText());
};
const whisperRadio = (page) => page.locator('input[name="engine"][value="whisper"]');
const browserRadio = (page) => page.locator('input[name="engine"][value="browser"]');

const results = [];
async function stage(name, fn) {
  if (ONLY && !ONLY.has(name.split(":")[0])) return;
  const opened = [];
  const before = errors.length;
  try {
    const note = await fn(opened);
    if (errors.length > before) throw new Error(`page errors: ${errors.slice(before).join(" | ")}`);
    results.push({ name, ok: true, note });
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, note: String(error.message ?? error) });
    console.log(`FAIL  ${name}: ${String(error.message ?? error).split("\n")[0]}`);
  }
  for (const one of opened) await one.context.close().catch(() => {});
}
const device_ = async (opened, options) => {
  const one = await open(options);
  opened.push(one);
  return one;
};

// ---------- which recognizer ----------

await stage("home-screen: an iPhone's Home Screen app, nothing downloaded: the first press listens with the browser's recognizer, no download, a press to switch, what it hears sets the way", async (opened) => {
  const { page } = await device_(opened);
  await press(page);
  await listened(page);
  await noOffer(page, "Home Screen app");
  await noWhisper(page, "Home Screen app");
  assert((await heardIn(page))[0].startsWith("nl"), `it should start in the language you're learning: ${await heardIn(page)}`);
  await page.locator('.lx-way-tab[data-code="nl"][aria-pressed="true"]').waitFor({ timeout: SECONDS });
  await page.screenshot({ path: `${OUT}/home-screen-listening.png` });
  const way = await hears(page, "het boek");
  assert(/^Dutch to English/.test(way), `the way: ${way}`);
  return way;
});

await stage("his-phone: the same app with the model already downloaded: the next press still uses the browser's recognizer, and Whisper never starts", async (opened) => {
  const { page } = await device_(opened, { model: true });
  await press(page);
  await listened(page);
  await noWhisper(page, "a model on the device isn't a choice");
  await noOffer(page, "the model's here");
  await hears(page, "het boek");
  await noWhisper(page, "after it heard");
});

await stage("switch: a press to switch stays: it listens in English, and the next visit's first press listens and says the same language", async (opened) => {
  const one = await device_(opened);
  await press(one.page);
  await listened(one.page);
  await one.page.locator('.lx-way-tab[data-code="en"]').click();
  await listened(one.page, 2);
  assert((await heardIn(one.page)).at(-1).startsWith("en"), `after the switch: ${await heardIn(one.page)}`);
  await one.page.locator('[data-part="translate-field"]').waitFor();
  await one.page.reload();
  await today(one.page);
  await press(one.page);
  await listened(one.page);
  await one.page.locator('.lx-way-tab[data-code="en"][aria-pressed="true"]').waitFor({ timeout: SECONDS });
  const langs = await heardIn(one.page);
  assert(langs[0].startsWith("en"), `the bubble's on English, but it listened in ${langs[0]}`);
  const way = await hears(one.page, "the book");
  assert(/^English to Dutch/.test(way), `the way: ${way}`);
});

await stage("no-recognizer-phone: a phone with no recognizer: Whisper isn't offered, with or without its model, and it says so; typing still works", async (opened) => {
  const none = await device_(opened, { userAgent: ANDROID, recognizer: "none" });
  await press(none.page);
  await none.page.getByText(/no speech recognizer/i).waitFor({ timeout: SECONDS });
  await noOffer(none.page, "a phone");
  await noWhisper(none.page, "a phone");
  const here = await device_(opened, { userAgent: ANDROID, recognizer: "none", model: true });
  await press(here.page);
  await here.page.getByText(/no speech recognizer/i).waitFor({ timeout: SECONDS });
  await noWhisper(here.page, "a phone, the model on it, not chosen");
  await here.page.locator(FIELD).fill("boek");
  await here.page.waitForSelector(".lx-tr-results *", { timeout: SECONDS });
});

await stage("computer: on a computer the browser's goes first too; with none, Whisper listens if it's there, and otherwise its download is offered with its size", async (opened) => {
  const both = await device_(opened, { userAgent: MAC_SAFARI, model: true });
  await press(both.page);
  await listened(both.page);
  await noWhisper(both.page, "a computer, the browser's first");
  const here = await device_(opened, { userAgent: MAC_SAFARI, recognizer: "none", model: true });
  await press(here.page);
  await whisperAsked(here.page);
  const not = await device_(opened, { userAgent: MAC_SAFARI, recognizer: "none" });
  await press(not.page);
  await not.page.locator(`${OFFER} p`, { hasText: "It downloads once" }).waitFor({ timeout: SECONDS });
  const said = await not.page.locator(OFFER).innerText();
  assert(/\d+ MB/.test(said), `the offer's size: ${said}`);
  await noWhisper(not.page, "offered, not started");
  return said.split("\n")[0];
});

await stage("chosen: someone who chose Whisper in Settings gets it in Translate, on a phone too, and the phone lets it go once it has written down what was said", async (opened) => {
  const { page } = await device_(opened, { model: true, engine: "whisper" });
  await press(page);
  await whisperAsked(page);
  assert(!(await heardIn(page)).length, `the browser's recognizer was used: ${await heardIn(page)}`);
  await page.waitForFunction(([field]) => document.querySelector(field)?.value === "het boek", [FIELD], { timeout: SECONDS });
  const counts = await whisperCounts(page);
  assert(counts.transcribes === 1, `asked to write it down ${counts.transcribes} times`);
  await page.waitForFunction(() => window.lxWhisper.terminated >= 1, null, { timeout: SECONDS });
});

await stage("old-choice: a phone whose setting says Whisper from before today goes back to the browser's recognizer, once; choosing it again stays", async (opened) => {
  const { page } = await device_(opened, { model: true });
  await page.evaluate(async () => {
    localStorage.removeItem("lx.whisper.phone-choice.v1");
    (await import("/js/study/settings.js")).setStudySetting("say.engine", "whisper");
  });
  await today(await page.reload().then(() => page));
  await press(page);
  await listened(page);
  await noWhisper(page, "a choice from before");
  await today(await page.reload().then(() => page));
  await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("say.engine", "whisper"));
  await today(await page.reload().then(() => page));
  await press(page);
  await whisperAsked(page);
});

await stage("same-order: Translate and a conversation choose alike on the Home Screen: the browser's by default, Whisper for who chose it", async (opened) => {
  const { page } = await device_(opened, { model: true });
  const ask = () => page.evaluate(async () => {
    const { chooseDictation, chooseEngine } = await import("/js/study/speaking.js");
    const [conversation, translate] = [await chooseEngine("nl-NL"), await chooseDictation("nl-NL")];
    return { conversation: conversation.engine, translate: translate.engine };
  });
  const asDefault = await ask();
  assert(asDefault.conversation === "browser" && asDefault.translate === "browser", `by default: ${JSON.stringify(asDefault)}`);
  await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("say.engine", "whisper"));
  const chosen = await ask();
  assert(chosen.conversation === "whisper" && chosen.translate === "whisper", `chosen: ${JSON.stringify(chosen)}`);
});

await stage("refused-phone: the recognizer really refuses on the Home Screen: it says so in words, offers nothing, starts no Whisper, tries again at the next press; typing works", async (opened) => {
  const { page } = await device_(opened, { recognizer: "refuses", model: true });
  await press(page);
  await listened(page);
  await page.getByText(/wouldn't start/).waitFor({ timeout: SECONDS });
  await noOffer(page, "a phone");
  await noWhisper(page, "a phone, not chosen");
  await page.screenshot({ path: `${OUT}/home-screen-refused.png` });
  const line = await page.getByText(/wouldn't start/).innerText();
  await page.waitForFunction((mic) => !document.querySelector(mic)?.hasAttribute("data-state"), MIC, { timeout: SECONDS });
  await press(page);
  await listened(page, 2);
  await noWhisper(page, "the second press");
  await page.locator(FIELD).fill("boek");
  await page.waitForSelector(".lx-tr-results *", { timeout: SECONDS });
  return line;
});

await stage("deaf: a recognizer that goes quiet for good says nothing at all: a press stops waiting within seconds, unpressed it stops by itself, it says what to do, and what was typed still works", async (opened) => {
  const { page } = await device_(opened, { recognizer: "deaf" });
  await press(page);
  await listened(page);
  await page.waitForFunction((mic) => /listening|asking/.test(document.querySelector(mic)?.getAttribute("data-state") ?? "") , MIC, { timeout: SECONDS });
  await press(page);
  await page.getByText(/close the app and open it again/).waitFor({ timeout: 6000 });
  await page.waitForFunction((mic) => !document.querySelector(mic)?.hasAttribute("data-state"), MIC, { timeout: SECONDS });
  const line = await page.getByText(/close the app and open it again/).innerText();
  await noWhisper(page, "a phone, not chosen");
  // Left alone.
  const started = Date.now();
  await press(page);
  await listened(page, 2);
  await page.getByText(/close the app and open it again/).waitFor({ timeout: 30_000 });
  await page.waitForFunction((mic) => !document.querySelector(mic)?.hasAttribute("data-state"), MIC, { timeout: SECONDS });
  const waited = Math.round((Date.now() - started) / 1000);
  assert(waited >= 15, `it gave up after ${waited} s`);
  await page.locator(FIELD).fill("boek");
  await page.waitForSelector(".lx-tr-results *", { timeout: SECONDS });
  return `${line} (left alone: ${waited} s)`;
});

await stage("refused-computer: the recognizer really refuses on a computer: it says so, and the next press falls back to Whisper if it's there, or offers it", async (opened) => {
  const here = await device_(opened, { userAgent: MAC_SAFARI, recognizer: "refuses", model: true });
  await press(here.page);
  await here.page.getByText(/Press the microphone again/).waitFor({ timeout: SECONDS });
  await noWhisper(here.page, "until the next press");
  await here.page.waitForFunction((mic) => !document.querySelector(mic)?.hasAttribute("data-state"), MIC, { timeout: SECONDS });
  await press(here.page);
  await whisperAsked(here.page);
  const not = await device_(opened, { userAgent: MAC_SAFARI, recognizer: "refuses" });
  await press(not.page);
  await not.page.getByText(/Press the microphone again/).waitFor({ timeout: SECONDS });
  await not.page.waitForFunction((mic) => !document.querySelector(mic)?.hasAttribute("data-state"), MIC, { timeout: SECONDS });
  await press(not.page);
  await not.page.locator(`${OFFER} p`, { hasText: "It downloads once" }).waitFor({ timeout: SECONDS });
});

await stage("settings-words: Settings on the Home Screen says nothing false about the browser's recognizer", async (opened) => {
  const { page } = await device_(opened);
  const text = await speakingSettings(page);
  assert(!/may not work/.test(text), "it still says the recognizer may not work");
  assert(!/doesn't have one/.test(text), "it says this browser doesn't have one");
  assert(await browserRadio(page).isEnabled(), "the browser's recognizer can't be chosen");
  await page.screenshot({ path: `${OUT}/settings-home-screen.png`, fullPage: true });
});

// ---------- a crash never happens twice ----------

/** After a crash: nothing starts Whisper by itself, Settings says so plainly, and it can be tried again only by a press. */
async function afterCrash(one, stageWord) {
  const page = await again(one);
  const seen = await stopped(page);
  assert(seen, "the app opened after a crash and didn't notice");
  assert(seen.stage === stageWord, `it died ${stageWord}, and the note says ${seen.stage}`);
  await press(page);
  await listened(page);
  await noWhisper(page, "the next press after a crash");
  const conversation = await page.evaluate(async () => {
    const choice = await (await import("/js/study/speaking.js")).chooseEngine("nl-NL");
    return { engine: choice.engine, fellBack: choice.fellBack };
  });
  assert(conversation.engine === "browser" && conversation.fellBack, `Say it and a conversation: ${JSON.stringify(conversation)}`);
  await noWhisper(page, "asking Say it's choice");
  const text = await speakingSettings(page);
  assert(/Whisper stopped this app/.test(text), `Settings doesn't say so: ${text.slice(0, 600)}`);
  assert(await whisperRadio(page).isDisabled(), "Whisper can still be chosen with a tap");
  assert(await browserRadio(page).isChecked(), "Settings should show what's really listening");
  await noWhisper(page, "opening Settings, which warms Whisper up when it's chosen");
  return page;
}

await stage("crash-loading: the page dies while Whisper loads: the app notices when it opens, the next press and Say it use the browser's recognizer, Settings says so plainly", async (opened) => {
  const one = await device_(opened, { model: true, engine: "whisper", whisper: "hangs" });
  await press(one.page);
  await whisperAsked(one.page);
  await kill(one.page);
  const page = await afterCrash(one, "loading");
  await page.waitForTimeout(800); // The move from Translate's page, finished.
  await page.screenshot({ path: `${OUT}/settings-after-crash.png`, fullPage: true });
});

await stage("crash-held: the page dies with Whisper loaded and nothing else happening: the same", async (opened) => {
  const one = await device_(opened, { model: true, engine: "whisper" });
  await press(one.page);
  await whisperAsked(one.page);
  await one.page.waitForFunction((mic) => /listening|hearing/.test(document.querySelector(mic)?.getAttribute("data-state") ?? ""), MIC, { timeout: SECONDS });
  await kill(one.page);
  await afterCrash(one, "held");
});

await stage("crash-thinking: the page dies while Whisper writes down what was said: the same", async (opened) => {
  const one = await device_(opened, { model: true, engine: "whisper", whisper: "hangs-thinking" });
  await press(one.page);
  await whisperAsked(one.page);
  await one.page.waitForFunction(() => window.lxWhisper.transcribes >= 1, null, { timeout: SECONDS });
  await kill(one.page);
  await afterCrash(one, "thinking");
});

await stage("try-again: only a press in Settings tries Whisper again; if it dies again, it's noted again and nothing retries", async (opened) => {
  const one = await device_(opened, { model: true, engine: "whisper", whisper: "hangs" });
  await press(one.page);
  await whisperAsked(one.page);
  await kill(one.page);
  const page = await afterCrash(one, "loading");
  await page.getByRole("button", { name: "Try Whisper again" }).click();
  await whisperRadio(page).and(page.locator(":enabled")).waitFor({ state: "attached", timeout: SECONDS });
  assert(!(await stopped(page)), "still noted after the press");
  await noWhisper(page, "the press itself starts nothing but the choice");
  await today(page);
  await press(page);
  await whisperAsked(page);
  await kill(page);
  await afterCrash({ context: one.context }, "loading");
});

await stage("no-false-alarm: leaving, reloading or a second tab while Whisper's in memory isn't a crash", async (opened) => {
  const one = await device_(opened, { model: true, engine: "whisper", whisper: "hangs" });
  const { page } = one;
  await press(page);
  await whisperAsked(page);
  // A second tab, while the first really has it loading.
  const second = await again(one);
  assert(!(await stopped(second)), "a second tab took the first one's load for a crash");
  await second.close();
  // A reload.
  await page.reload();
  await today(page);
  assert(!(await stopped(page)), "a reload during the load was taken for a crash");
  // Closing the page.
  await press(page);
  await page.waitForFunction(() => window.lxWhisper.loads >= 1, null, { timeout: SECONDS });
  await page.close({ runBeforeUnload: false });
  const third = await again(one);
  assert(!(await stopped(third)), "closing the page during the load was taken for a crash");
  await third.close();
  // Loaded, then let go.
  const other = await device_(opened, { model: true, engine: "whisper" });
  await other.page.evaluate(async () => {
    const speech = await import("/js/speech/speech.js");
    await speech.prepare({ engine: "whisper", model: "whisper-small" }).catch(() => speech.prepare({ engine: "whisper" }));
    speech.unload();
  });
  await kill(other.page);
  const fourth = await again(other);
  assert(!(await stopped(fourth)), "a crash after Whisper had been let go isn't Whisper's");
});

await stage("hidden: a phone lets Whisper go as the app leaves the screen, and a kill in the background isn't called a crash", async (opened) => {
  const one = await device_(opened, { model: true, engine: "whisper" });
  await one.page.evaluate(async () => (await import("/js/speech/speech.js")).prepare({ engine: "whisper" }));
  await one.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await one.page.waitForFunction(() => window.lxWhisper.terminated >= 1, null, { timeout: SECONDS });
  await kill(one.page);
  const page = await again(one);
  assert(!(await stopped(page)), "killed in the background, and called a crash");
});

await browser.close().catch(() => {});
writeFileSync(`${OUT}/dictation-check.json`, JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
