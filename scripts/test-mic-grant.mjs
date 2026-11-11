// How often the microphone asks in one launch (speech/mic.js openMic, releaseMic), with an iPhone's WebKit played in Node as
// it was measured on an iPhone 17 Simulator, iOS 26.4 (lex-translate, 6 Nov 2026; scratch/i18n/mic):
//   - most launches of the app added to the Home Screen keep the grant they're given: the first getUserMedia asks, later
//     ones answer in 4–80 ms without asking, and the Permissions API reads "granted";
//   - some launches (4 of 6 opened within a minute or two of being closed) forget it between recordings: EVERY getUserMedia
//     asks. The Permissions API read "prompt" right after the yes in most of them, "granted" in one;
//   - a Safari tab kept it in every run.
// Every launch starts by asking: WebKit keeps no grant across launches of a Home Screen app (WebKit bug 327237). Stages:
//   1. a forgetting launch reading "prompt": three recordings ask once, the stream kept between them with its tracks off;
//   2. a forgetting launch reading "granted": the second recording's slow answer gives it away, and the third asks no more;
//   3. a launch that keeps its grant: asked once, every recording's tracks stopped after it (indicator off, speaker back);
//   4. a Safari tab: never kept, as before;
//   5. the kept stream let go when the app is hidden, and asked for again after;
//   6. a refusal: nothing kept, and the next press asks again;
//   7. Chrome: never kept.
// node scripts/test-mic-grant.mjs [<app dir>]   (another copy's dir to see it fail on one from before) (exit 0 = pass)

import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), "../.."));
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

// The page: navigator, document visibility, a stream's tracks.
class Track {
  constructor() { this.readyState = "live"; this.enabled = true; this.listeners = []; }
  stop() { this.readyState = "ended"; }
  addEventListener() {}
}
class Stream {
  constructor() { this.tracks = [new Track()]; }
  get active() { return this.tracks.some((t) => t.readyState === "live"); }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks; }
}
const doc = new EventTarget();
doc.visibilityState = "visible";
globalThis.document = doc;
globalThis.isSecureContext = true;

// The browser: what a launch remembers, how many times it asked.
const browser = { ua: "", keeps: true, reads: null, standalone: true, granted: false, refuse: false, asked: 0 };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    get userAgent() { return browser.ua; },
    platform: "iPhone",
    maxTouchPoints: 5,
    get standalone() { return browser.standalone; },
    mediaDevices: {
      async getUserMedia() {
        if (!browser.granted) {
          browser.asked++;
          await new Promise((r) => setTimeout(r, 320)); // a person answering the prompt
          if (browser.refuse) throw Object.assign(new Error("refused"), { name: "NotAllowedError" });
          if (browser.keeps) browser.granted = true;
        }
        return new Stream();
      },
    },
    permissions: { async query() { return { state: browser.refuse ? "denied" : browser.reads ?? (browser.granted ? "granted" : "prompt") }; } },
  },
});
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

const mic = await import(pathToFileURL(join(APP, "public/js/speech/mic.js")).href);
// A launch: the page's own memory of a kept stream goes with it (a fresh import), the browser's grant too.
let fresh = 0;
async function launch({ ua = IPHONE, keeps, reads = null, standalone = true }) {
  Object.assign(browser, { ua, keeps, reads, standalone, granted: false, refuse: false, asked: 0 });
  doc.visibilityState = "visible";
  return import(`${pathToFileURL(join(APP, "public/js/speech/mic.js")).href}?launch=${++fresh}`);
}
// A recording as speech.js makes one: the stream opened, used, let go.
async function use(m) {
  const stream = await m.openMic({ processing: false });
  const live = stream.getAudioTracks().every((t) => t.readyState === "live" && t.enabled);
  m.releaseMic(stream);
  return { stream, live };
}
void mic;

const stopped = (stream) => stream.getAudioTracks().every((t) => t.readyState === "ended");
const keptOff = (stream) => stream.getAudioTracks().every((t) => t.readyState === "live" && !t.enabled);

// 1. A forgetting launch that reads "prompt" after the yes.
{
  const m = await launch({ keeps: false });
  const uses = [await use(m), await use(m), await use(m)];
  check(browser.asked === 1, `a launch that forgets, reading "prompt": three recordings ask once (asked ${browser.asked})`);
  check(uses.every((u) => u.live), "each recording had a live, enabled track");
  check(keptOff(uses.at(-1).stream), "between recordings the kept stream's tracks are off, not stopped");
}

// 2. A forgetting launch that reads "granted" all along (Safari's Microphone set to Allow): found out by the second ask.
{
  const m = await launch({ keeps: false, reads: "granted" });
  const uses = [await use(m), await use(m), await use(m), await use(m)];
  check(browser.asked === 2, `a launch that forgets, reading "granted": four recordings ask twice, then no more (asked ${browser.asked})`);
  check(stopped(uses[0].stream) && keptOff(uses[3].stream), "the first recording's tracks stopped, the kept one's off");
}

// 3. A launch that keeps its grant: nothing kept.
{
  const m = await launch({ keeps: true });
  const uses = [await use(m), await use(m), await use(m)];
  check(browser.asked === 1, `a launch that keeps its grant: three recordings ask once (asked ${browser.asked})`);
  check(uses.every((u) => stopped(u.stream)), "every recording's tracks stopped after it (the indicator off, the speaker back)");
  check(new Set(uses.map((u) => u.stream)).size === 3, "each recording its own stream");
}

// 4. A Safari tab (kept its grant in every run): never kept, even reading "prompt".
{
  const m = await launch({ keeps: true, reads: "prompt", standalone: false });
  const uses = [await use(m), await use(m)];
  check(uses.every((u) => stopped(u.stream)), "a Safari tab: every recording's tracks stopped after it");
}

// 5. Hidden: the kept stream let go; back on screen, asked again (the launch forgets).
{
  const m = await launch({ keeps: false });
  const first = (await use(m)).stream;
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  check(stopped(first), "hidden: the kept stream's tracks stopped");
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  await use(m);
  check(browser.asked === 2, `back on screen, the next recording asks again (asked ${browser.asked})`);
}

// 6. A refusal keeps nothing.
{
  const m = await launch({ keeps: false });
  browser.refuse = true;
  let code = null;
  try { await use(m); } catch (error) { code = error.code; }
  check(code === "denied", `a refusal is "denied" (${code})`);
  browser.refuse = false;
  await use(m);
  check(browser.asked === 2, `the press after a refusal asks again (asked ${browser.asked})`);
}

// 7. Chrome: never kept, even reading "prompt" after a yes (a check's fake microphone).
{
  const m = await launch({ ua: CHROME, keeps: false, standalone: false });
  const uses = [await use(m), await use(m)];
  check(uses.every((u) => stopped(u.stream)), "Chrome: every recording's tracks stopped after it, as before");
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
