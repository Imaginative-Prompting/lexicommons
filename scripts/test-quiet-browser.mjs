// No check makes a sound, and none launches the owner's Chrome (scripts/quiet-browser.mjs). Three parts:
//   1. every script under scripts/ (and 08's tools/ and docs/, where they're beside it) gets its browser from
//      quiet-browser.mjs, never from playwright directly, and no script under scripts/ names his Chrome;
//   2. nothing starts here: with Playwright's launch replaced by a recorder, every way a script can ask for a browser must
//      arrive as Chrome for Testing, and a missing or wrong install must refuse. If this fails, part 3 doesn't launch;
//   3. with --browser: the launched process is Chrome for Testing, and macOS lists no com.google.Chrome from it. A page in
//      it speaks (volume 0, so even a failure is silent) and the real synthesizer never starts, while the utterance still
//      gets its start and end events, the voices stay the real list, a media element that plays is muted, and Web Audio
//      plays into zero volume. Run it through the GPU queue's parallel lane, from the channel repo root:
//        python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "quiet browser" --kind parallel -- \
//          node 08-lexicommons/app/scripts/test-quiet-browser.mjs --browser
// Exit 0 = pass.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import playwright from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

const HIS_CHROME_APP = "/Applications/Google Chrome.app";
const HIS_CHROME = `${HIS_CHROME_APP}/Contents/MacOS/Google Chrome`;
const FOR_TESTING = "com.google.chrome.for.testing";
const HERE_SKIPS = new Set([join(HERE, "quiet-browser.mjs"), join(HERE, "test-quiet-browser.mjs")]);

const walked = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules" && name !== "fixtures") walked(path, out);
    } else if (/\.(mjs|js)$/.test(name)) out.push(path);
  }
  return out;
};
const scripts = walked(HERE);
// Beside the app in the channel repo: tools and the probes kept as evidence. A copy of the app has neither.
const beside = [...walked(join(HERE, "../../tools")), ...walked(join(HERE, "../../docs"))];
const PLAYWRIGHT = /from\s+["']playwright(?:-core)?["']|import\(\s*["']playwright(?:-core)?["']\s*\)|resolve\(\s*["']playwright(?:-core)?["']\s*\)|require\(\s*["']playwright(?:-core)?["']\s*\)/;
const direct = [...scripts, ...beside]
  .filter((path) => !HERE_SKIPS.has(path) && PLAYWRIGHT.test(readFileSync(path, "utf8")))
  .map((path) => relative(HERE, path));
check("every script's browser comes from quiet-browser.mjs", direct.length === 0, direct.length ? `straight from playwright: ${direct.join(", ")}` : "");
const NAMES_HIS_CHROME = /Google Chrome\.app|-a\s+["']?Google Chrome\b|com\.google\.Chrome\b/;
const naming = scripts.filter((path) => !HERE_SKIPS.has(path) && NAMES_HIS_CHROME.test(readFileSync(path, "utf8"))).map((path) => relative(HERE, path));
check("no script names the owner's Chrome", naming.length === 0, naming.join(", "));

// Nothing starts in this part: Playwright's own launch is a recorder, so even a wrapper that gets this wrong reaches nothing.
const { chromium, chromiumAt } = await import("./quiet-browser.mjs");
const realLaunch = playwright.chromium.launch;
const realPersistent = playwright.chromium.launchPersistentContext;
const recorded = [];
playwright.chromium.launch = async (options) => {
  recorded.push(options ?? {});
  return { newContext: async () => ({ addInitScript: async () => {} }), newPage: async () => ({ addInitScript: async () => {} }) };
};
playwright.chromium.launchPersistentContext = async (dir, options) => {
  recorded.push(options ?? {});
  return { addInitScript: async () => {} };
};
const bundleOf = (executable) => {
  const plist = join(executable.slice(0, executable.indexOf(".app/") + 4), "Contents/Info.plist");
  if (!existsSync(plist)) return "not installed";
  return execFileSync("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", plist], { encoding: "utf8" }).trim();
};
/** Where Playwright would take these options; "" when it's Chrome for Testing. */
const wrongTarget = (options) => {
  if (options.channel) return `channel "${options.channel}" (for "chrome": ${HIS_CHROME})`;
  if (!options.executablePath) return "Playwright's own Chromium";
  if (!existsSync(options.executablePath)) return `${options.executablePath}, which isn't there`;
  const bundle = bundleOf(options.executablePath);
  return bundle === FOR_TESTING ? "" : `${options.executablePath} (${bundle})`;
};
const attempts = [
  ['channel "chrome"', { headless: true, channel: "chrome" }],
  ["another channel", { headless: true, channel: "chrome-beta" }],
  ["no channel", { headless: true }],
  ["no options", undefined],
  ["his Chrome's path", { headless: true, executablePath: HIS_CHROME }],
  ["a channel and his Chrome's path", { headless: true, channel: "chrome", executablePath: HIS_CHROME }],
];
const aimed = async (label, launch) => {
  recorded.length = 0;
  let refused = "";
  try {
    await launch();
  } catch (error) {
    refused = error.message;
  }
  const reached = recorded.length ? wrongTarget(recorded[0]) : `refused: ${refused}`;
  check(`${label}: arrives as Chrome for Testing`, recorded.length === 1 && reached === "", reached);
  return reached === "";
};
let aimedWell = true;
for (const [what, options] of attempts) {
  aimedWell = (await aimed(`launch, ${what}`, () => chromium.launch(options))) && aimedWell;
  aimedWell = (await aimed(`persistent profile, ${what}`, () => chromium.launchPersistentContext("unused-profile", options))) && aimedWell;
}
const named = chromium.executablePath();
check("executablePath() isn't the owner's Chrome", !named.startsWith(HIS_CHROME_APP) && bundleOf(named) === FOR_TESTING, named);

const fake = mkdtempSync(join(tmpdir(), "quiet-browser-"));
const fakeApp = join(fake, "Google Chrome for Testing.app");
mkdirSync(join(fakeApp, "Contents/MacOS"), { recursive: true });
writeFileSync(join(fakeApp, "Contents/MacOS/Google Chrome for Testing"), "");
writeFileSync(join(fakeApp, "Contents/Info.plist"), '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.google.Chrome</string></dict></plist>');
for (const [what, app, says] of [
  ["not installed", join(fake, "missing.app"), /isn't installed/],
  ["the owner's Chrome as the app", HIS_CHROME_APP, /isn't installed/],
  ["an app that's really com.google.Chrome", fakeApp, /is com\.google\.Chrome/],
]) {
  recorded.length = 0;
  let refused = "";
  try {
    if (typeof chromiumAt !== "function") throw new Error("quiet-browser.mjs has no chromiumAt");
    await chromiumAt(app).launch({ headless: true, channel: "chrome" });
  } catch (error) {
    refused = error.message;
  }
  check(`${what}: refuses, and falls back to nothing`, recorded.length === 0 && says.test(refused), refused || `launched with ${JSON.stringify(recorded[0])}`);
  aimedWell &&= recorded.length === 0;
}
rmSync(fake, { recursive: true, force: true });
playwright.chromium.launch = realLaunch;
playwright.chromium.launchPersistentContext = realPersistent;
if (!aimedWell && process.argv.includes("--browser")) {
  check("the browser part ran", false, "not launching anything: a launch here could reach the owner's Chrome");
  process.argv.splice(process.argv.indexOf("--browser"), 1);
}

if (process.argv.includes("--browser")) {
  // A tiny WAV (silence), for the media element.
  const wav = Buffer.alloc(44 + 800);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + 800, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(800, 40); wav.fill(128, 44);
  const server = createServer((req, res) => {
    if (req.url === "/silence.wav") return res.writeHead(200, { "content-type": "audio/wav" }).end(wav);
    res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>quiet</title>");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const appsNamed = (bundle) => execFileSync("/usr/bin/lsappinfo", ["find", `bundleid=${bundle}`], { encoding: "utf8" }).match(/ASN:0x[0-9a-f]+-0x[0-9a-f]+/g) ?? [];
  const typeOf = (asn) => execFileSync("/usr/bin/lsappinfo", ["info", asn], { encoding: "utf8" }).match(/\btype="([^"]+)"/)?.[1] ?? "";
  const hisBefore = appsNamed("com.google.Chrome");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    // This process's own child, by what it really is, then what macOS lists while it runs.
    const children = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" }).split("\n")
      .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter((row) => row && Number(row[2]) === process.pid).map((row) => row[3]);
    check("the browser this launched is Chrome for Testing", children.some((c) => c.includes("Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")), children.join(" | ").slice(0, 200));
    check("this process has no child from the owner's Chrome", !children.some((c) => c.includes(HIS_CHROME_APP)));
    // The same reading on our own browser, which must be a background app: it shows the reading can see the thing it looks for.
    const ours = appsNamed(FOR_TESTING);
    const ourTypes = ours.map(typeOf);
    check("macOS lists Chrome for Testing while it runs, as a background app", ourTypes.includes("BackgroundOnly"), `${ours.join(" ")} ${ourTypes.join(" ")}`);
    const hisDuring = appsNamed("com.google.Chrome");
    const added = hisDuring.filter((asn) => !hisBefore.includes(asn));
    // He can open Chrome at any moment, so a new entry only counts against this if it's a background one.
    const hisTypes = hisDuring.map(typeOf);
    check("macOS lists no background com.google.Chrome while it runs", !hisTypes.includes("BackgroundOnly"), `before ${hisBefore.join(" ") || "none"}; during ${hisDuring.join(" ") || "none"} (${hisTypes.join(" ")}); new ${added.join(" ") || "none"}`);
    for (const [how, open] of [
      ["a context's page", async () => (await browser.newContext()).newPage()],
      ["browser.newPage", async () => browser.newPage()],
    ]) {
      const page = await open();
      await page.goto(`${base}/`);
      const seen = await page.evaluate(async () => {
        const synth = window.speechSynthesis;
        const real = synth.real ?? synth;
        const u = new SpeechSynthesisUtterance("quiet check");
        u.volume = 0;
        const events = [];
        u.onstart = () => events.push("start");
        u.addEventListener("end", () => events.push("end"));
        synth.speak(u);
        let realBusy = false;
        for (let i = 0; i < 20; i++) {
          realBusy ||= real.speaking || real.pending;
          await new Promise((done) => setTimeout(done, 50));
        }
        real.cancel();
        const audio = new Audio("/silence.wav");
        await audio.play().catch(() => {});
        // Web Audio: what plays reaches the speakers only through a zero gain.
        const context = new AudioContext();
        const destination = context.destination;
        const webAudio = { silent: AudioContext.silent === true, gain: destination.gain?.value ?? null, same: context.destination === destination };
        await context.close();
        return {
          webAudio,
          silent: synth.silent === true,
          realBusy,
          events,
          sameVoices: synth.getVoices().length === real.getVoices().length,
          muted: audio.muted,
        };
      });
      check(`${how}: speechSynthesis is the silent one`, seen.silent);
      check(`${how}: the real synthesizer never spoke`, !seen.realBusy);
      check(`${how}: the utterance got start and end`, seen.events.join() === "start,end", seen.events.join() || "none");
      check(`${how}: getVoices is the real list`, seen.sameVoices);
      check(`${how}: a media element that plays is muted`, seen.muted);
      check(`${how}: Web Audio plays into zero volume`, seen.webAudio.silent && seen.webAudio.gain === 0 && seen.webAudio.same, JSON.stringify(seen.webAudio));
    }
    const args = browser._quietArgs;
    check("Chrome launched with --mute-audio", Array.isArray(args) && args.includes("--mute-audio"), JSON.stringify(args));
  } finally {
    await browser.close();
    server.close();
  }
}

for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
