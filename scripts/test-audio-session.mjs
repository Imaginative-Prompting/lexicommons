// The page's audio session has one owner (public/js/lx/audio-session.js). Its type is the whole page's, so a file that sets it
// decides for every sound after it: on 5 Nov 2026 the celebration's chime set "ambient" and left it, and on an iPhone with the
// silent switch on, every recording after a first finished lesson played nothing.
//   1. no file under public/ but lx/audio-session.js names navigator.audioSession (the scan has a control: a planted line fails it;
//      the temporary public/sound-test/ measures the types on a phone, and is left out);
//   2. audioSessionFor: "microphone" → play-and-record, "idle" → auto, nothing else; no Audio Session API, or one that throws,
//      changes nothing and throws nothing.
// node scripts/test-audio-session.mjs [<app dir>]   (another copy's dir to see it fail on one from before) (exit 0 = pass)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), "../.."));
const PUBLIC = join(APP, "public");
const OWNER = "js/lx/audio-session.js";
const SKIP = new Set(["vendor", "models", "flags", "fonts", "pictures", "audio", "icons"]);
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

// Where a file names the Audio Session API: [line numbers].
export const touches = (text) => text.split("\n").flatMap((line, i) => (/\baudioSession\b/.test(line) ? [i + 1] : []));

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP.has(name)) yield* files(path);
    } else if (/\.(m?js|html)$/.test(name)) yield path;
  }
}

// 1. One owner.
check(touches("const a = 1;\nnavigator.audioSession.type = 'ambient';").join() === "2", "the scan finds a planted line (its control)");
const others = [];
let scanned = 0;
for (const path of files(PUBLIC)) {
  scanned++;
  const rel = relative(PUBLIC, path);
  // The temporary sound test (public/sound-test/) sets the types the app doesn't use, on purpose: it measures them on a phone.
  if (rel === OWNER || rel.startsWith("sound-test/")) continue;
  const lines = touches(readFileSync(path, "utf8"));
  if (lines.length) others.push(`${rel}:${lines.join(",")}`);
}
check(scanned > 100, `scanned ${scanned} files under public/`);
check(others.length === 0, `only ${OWNER} names navigator.audioSession${others.length ? `; also: ${others.join(" ")}` : ""}`);

// 2. The policy itself, on a stand-in navigator.
let owner = null;
try {
  owner = await import(pathToFileURL(join(PUBLIC, OWNER)).href);
} catch (error) {
  check(false, `${OWNER} loads in Node (${error.message})`);
}
if (owner) {
  const sets = [];
  const session = {
    _type: "auto",
    get type() {
      return this._type;
    },
    set type(value) {
      sets.push(value);
      this._type = value;
    },
  };
  const stand = (value) => Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
  const real = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  stand({ audioSession: session });
  owner.audioSessionFor("microphone");
  check(session.type === "play-and-record", `microphone: play-and-record (got ${session.type})`);
  owner.audioSessionFor("idle");
  check(session.type === "auto", `idle: auto (got ${session.type})`);
  sets.length = 0;
  owner.audioSessionFor("idle");
  check(sets.length === 0, "idle when already auto: not set again");
  let threw = false;
  try {
    owner.audioSessionFor("effects");
  } catch {
    threw = true;
  }
  check(threw && session.type === "auto", "an unknown use throws and changes nothing");
  check(!Object.values(owner.AUDIO_SESSION_TYPES).includes("ambient") && !Object.values(owner.AUDIO_SESSION_TYPES).includes("playback"),
    "no use sets ambient or playback (speech plays as media, effects as Web Audio, under auto)");
  stand({});
  let ok = true;
  try {
    owner.audioSessionFor("microphone");
  } catch {
    ok = false;
  }
  check(ok, "no Audio Session API: nothing happens");
  stand({ audioSession: { get type() { return "auto"; }, set type(v) { throw new Error("refused"); } } });
  ok = true;
  try {
    owner.audioSessionFor("microphone");
  } catch {
    ok = false;
  }
  check(ok, "a session that refuses: nothing thrown");
  if (real) Object.defineProperty(globalThis, "navigator", real);
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
