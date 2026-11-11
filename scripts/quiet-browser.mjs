// Every browser a check launches, silent: import { chromium, webkit } from "./quiet-browser.mjs", never from
// "playwright". Checks run on the owner's Mac, and on 1 Nov 2026 they spoke words in one language after another out of its
// speakers.
//
// --mute-audio silences Chrome's own audio (media elements, Web Audio), but not speechSynthesis: on macOS the system's
// synthesizer speaks, outside Chrome. So every context and page also gets SILENCE before any of the app's code runs:
// speechSynthesis.speak queues and times an utterance and fires its events, as the real one does, and never makes a
// sound. getVoices() stays the real list. A check with its own fake (lang-check, reader-check) adds it after this one,
// and its fake wins. Media elements are muted too, and Web Audio plays into a node at zero volume, for WebKit, which
// has no --mute-audio.
//
// And never the owner's own Chrome. A headless Chrome launched from /Applications/Google Chrome.app registers with macOS
// under his Chrome's bundle id, as a background app, and on 4 Nov 2026 he couldn't open Chrome at all while checks ran, most
// likely for that reason. So every launch through `chromium` runs Chrome for Testing,
// a separate app with its own bundle id, pinned below and installed outside the app by scripts/install-check-chrome.mjs.
// Whatever channel or path a script passes is replaced. If that app isn't there, the launch refuses; it never falls back.
//
// scripts/test-quiet-browser.mjs fails if a script imports a browser from playwright directly, if a launch would reach his
// Chrome, or if speak() reaches the real synthesizer.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import playwright from "playwright";

export const CHECK_CHROME_VERSION = "156.0.8078.80";
export const CHECK_CHROME_BUNDLE = "com.google.chrome.for.testing";
export const CHECK_CHROME_HOME = join(homedir(), ".local/share/chrome-for-testing");
export const CHECK_CHROME_APP = join(CHECK_CHROME_HOME, CHECK_CHROME_VERSION, "chrome-mac-arm64/Google Chrome for Testing.app");

const INSTALL = "node 08-lexicommons/app/scripts/install-check-chrome.mjs";
const confirmed = new Set();

/** The executable inside `app`, once it's shown to be Chrome for Testing. Anything else throws, so nothing launches. */
export function checkChromeAt(app) {
  const executable = join(app, "Contents/MacOS/Google Chrome for Testing");
  if (confirmed.has(app)) return executable;
  if (!existsSync(executable)) {
    throw new Error(`Chrome for Testing ${CHECK_CHROME_VERSION} isn't installed at ${app}. Checks never use the owner's Chrome. Install it from the channel repo root: ${INSTALL}`);
  }
  const bundle = execFileSync("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", join(app, "Contents/Info.plist")], { encoding: "utf8" }).trim();
  if (bundle !== CHECK_CHROME_BUNDLE) {
    throw new Error(`${app} is ${bundle}, not ${CHECK_CHROME_BUNDLE}. Checks only run on Chrome for Testing. Install it from the channel repo root: ${INSTALL}`);
  }
  confirmed.add(app);
  return executable;
}

export const SILENCE = () => {
  const real = window.speechSynthesis;
  if (real && !real.silent) {
    const queue = [];
    let current = null;
    const fire = (utterance, type) => {
      try {
        utterance.dispatchEvent(new SpeechSynthesisEvent(type, { utterance, charIndex: 0, elapsedTime: 0 }));
      } catch {
        utterance[`on${type}`]?.({ type, utterance });
      }
    };
    const next = () => {
      current = queue.shift() ?? null;
      if (!current) return;
      const utterance = current;
      setTimeout(() => {
        if (current !== utterance) return;
        fire(utterance, "start");
        setTimeout(() => {
          if (current !== utterance) return;
          fire(utterance, "end");
          next();
        }, Math.min(1500, 100 + 20 * String(utterance.text ?? "").length));
      }, 10);
    };
    const silent = {
      silent: true,
      get speaking() { return current !== null; },
      get pending() { return queue.length > 0; },
      get paused() { return false; },
      getVoices: () => real.getVoices(),
      speak(utterance) {
        queue.push(utterance);
        if (!current) next();
      },
      cancel() {
        queue.length = 0;
        current = null;
      },
      pause() {},
      resume() {},
      addEventListener: (...a) => real.addEventListener(...a),
      removeEventListener: (...a) => real.removeEventListener(...a),
      dispatchEvent: (event) => real.dispatchEvent(event),
      get onvoiceschanged() { return real.onvoiceschanged; },
      set onvoiceschanged(handler) { real.onvoiceschanged = handler; },
    };
    Object.defineProperty(silent, "real", { value: real }); // for test-quiet-browser.mjs
    Object.defineProperty(window, "speechSynthesis", { value: silent, configurable: true, writable: true });
  }
  // Web Audio (the sound effects, lx/sound.js) plays into a node at zero volume: WebKit has no --mute-audio.
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const Real = window[name];
    if (typeof Real !== "function" || Real.silent) continue;
    const Quiet = class extends Real {
      get destination() {
        if (!this.lxQuiet) {
          const gain = this.createGain();
          gain.gain.value = 0;
          gain.connect(super.destination);
          Object.defineProperty(this, "lxQuiet", { value: gain });
        }
        return this.lxQuiet;
      }
    };
    Object.defineProperty(Quiet, "silent", { value: true });
    Object.defineProperty(window, name, { value: Quiet, configurable: true, writable: true });
  }
  if (typeof HTMLMediaElement !== "undefined" && !HTMLMediaElement.prototype.play.silent) {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = Object.assign(function () {
      this.muted = true;
      return play.call(this);
    }, { silent: true });
  }
};

const MUTE = "--mute-audio";

// Checks start where they always have, on Home; the first run itself is first-run-check.mjs's, which sets LX_FIRST_RUN.
const NO_FIRST_RUN = () => {
  try {
    if (location.pathname.startsWith("/app") && !localStorage.getItem("lx.welcome.v1")) localStorage.setItem("lx.welcome.v1", "check");
  } catch {}
};

async function quietContext(context) {
  await context.addInitScript(SILENCE);
  if (!process.env.LX_FIRST_RUN) await context.addInitScript(NO_FIRST_RUN);
  return context;
}

function quietBrowser(browser) {
  const newContext = browser.newContext.bind(browser);
  const newPage = browser.newPage.bind(browser);
  browser.newContext = async (...a) => quietContext(await newContext(...a));
  browser.newPage = async (...a) => {
    const page = await newPage(...a);
    await page.addInitScript(SILENCE);
    if (!process.env.LX_FIRST_RUN) await page.addInitScript(NO_FIRST_RUN);
    return page;
  };
  return browser;
}

function quiet(type, { mute, app }) {
  const withMute = (options = {}) => (mute ? { ...options, args: [...new Set([...(options.args ?? []), MUTE])] } : options);
  const launchOptions = (options) => {
    const muted = withMute(options);
    if (!app) return muted;
    const { channel, executablePath, ...rest } = muted ?? {}; // whatever the script passes
    return { ...rest, executablePath: checkChromeAt(app) };
  };
  return {
    name: () => type.name(),
    executablePath: () => (app ? checkChromeAt(app) : type.executablePath()),
    launch: async (options) => {
      const launched = launchOptions(options);
      const browser = quietBrowser(await type.launch(launched));
      browser._quietArgs = launched?.args ?? []; // for test-quiet-browser.mjs
      return browser;
    },
    launchPersistentContext: async (dir, options) => quietContext(await type.launchPersistentContext(dir, launchOptions(options))),
  };
}

export const chromiumAt = (app) => quiet(playwright.chromium, { mute: true, app }); // for test-quiet-browser.mjs
export const chromium = chromiumAt(CHECK_CHROME_APP);
export const webkit = quiet(playwright.webkit, { mute: false });
