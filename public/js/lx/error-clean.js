// Error reports, cleaned: what an error says once everything that could be someone's has been taken out. Pure, and the same on
// both sides: the app cleans a report before it leaves the device (lx/error-report.js), and the Worker cleans it again before
// it's kept (src/errors.ts), since a report can come from anything that can send a request.
//
// What survives: the error's name, its message with quoted text, links, addresses, long numbers and tokens replaced, the frames
// of our own code (path, function, line), the screen it happened on (route names only), the app's version, and the browser's
// name and major version. What never does: what was typed or shown, a page's address with its query, an account, an IP.
// A start of the app that followed its page's end (the "reload" kind) keeps less still: the screen and the version alone.

export const ERROR_LIMITS = Object.freeze({
  message: 300, // characters kept of a cleaned message
  frames: 10, // frames kept of a stack
  perPage: 10, // reports one page load sends at most
  body: 8 * 1024, // bytes of a report's JSON
});

const ELLIPSIS = "…";
// Single-quoted words that are code (a property, a method, a module's name), which say where it broke: 'reading \'length\''.
const CODE_WORD = /^[A-Za-z_$][\w$.\-]{0,40}$/;
// Our own assets, which a message may name ("Failed to fetch dynamically imported module: …/js/x.js").
const OWN_ASSET = /^\/(?:js|css|fonts|icons|library|audio)\/[\w\-./]{1,160}$/;

/** A URL as what it's safe to keep: one of our own assets' paths, or nothing of it. */
function cleanUrl(text) {
  if (/^data:/i.test(text)) return "[data]";
  try {
    const url = new URL(text);
    if ((url.protocol === "https:" || url.protocol === "http:") && OWN_ASSET.test(url.pathname)) return url.pathname;
  } catch {}
  return "[link]";
}

/** An error message with everything that could be someone's replaced. */
export function cleanMessage(value) {
  let text = typeof value === "string" ? value : value === undefined || value === null ? "" : safeString(value);
  text = text.slice(0, 2000);
  text = text
    // Links of any scheme, before anything inside them is read as words.
    .replace(/\b(?:https?|wss?|blob|data|file|ftp|chrome-extension|moz-extension|safari-web-extension|webkit-masked-url):[^\s"'`<>)\]]*/gi, (m) => {
      // Punctuation ending a sentence isn't part of the link.
      const end = /[.,;:!?]+$/.exec(m)?.[0] ?? "";
      return `${cleanUrl(m.slice(0, m.length - end.length))}${end}`;
    })
    // Addresses.
    .replace(/[^\s@"'`<>()]+@[^\s@"'`<>()]+\.[A-Za-z]{2,}/g, "[email]")
    // Quoted text: what someone typed or a page held. "…", “…”, «…», `…` always; '…' unless it's a word of code.
    .replace(/"[^"\n]*"/g, `"${ELLIPSIS}"`)
    .replace(/“[^”\n]*”/g, `“${ELLIPSIS}”`)
    .replace(/«[^»\n]*»/g, `«${ELLIPSIS}»`)
    .replace(/`[^`\n]*`/g, `\`${ELLIPSIS}\``)
    // (An apostrophe inside a word, as in "can't", opens nothing.)
    .replace(/(^|[^A-Za-z0-9])'([^'\n]*)'(?![A-Za-z])/g, (m, before, inner) => (CODE_WORD.test(inner) ? m : `${before}'${ELLIPSIS}'`))
    // Tokens, keys and ids: long runs of letters and digits that mix in digits.
    .replace(/[A-Za-z0-9_\-+/=]{20,}/g, (m) => (/\d/.test(m) ? ELLIPSIS : m))
    // Long numbers (a phone number, an id): 5 digits or more.
    .replace(/\d{5,}/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > ERROR_LIMITS.message ? `${text.slice(0, ERROR_LIMITS.message - 1)}${ELLIPSIS}` : text;
}

function safeString(value) {
  try {
    return String(value);
  } catch {
    return "";
  }
}

// A frame's place: a URL or a path, then :line:col.
const PLACE = /((?:[a-z][\w+.-]*:\/\/[^\s()]*?)|(?:\/[^\s():]*?)|(?:[\w.-]+\.(?:js|mjs|ts)))(?::(\d+))(?::(\d+))?\)?\s*$/i;
const FUNCTION = /^[\w$.<>[\] ]{1,80}$/;

/** One stack line read in any engine's format: V8 ("at fn (url:1:2)"), JavaScriptCore and SpiderMonkey ("fn@url:1:2"), and our own cleaned "fn (path:1:2)". */
function readFrame(line) {
  const text = line.trim();
  if (!text) return null;
  const place = PLACE.exec(text);
  if (!place) return null;
  let fn = "";
  if (text.startsWith("at ")) {
    const head = text.slice(3, place.index).replace(/\($/, "").trim();
    fn = head.replace(/^async /, "").replace(/ \[as [^\]]*\]$/, "");
  } else if (text.includes("@")) {
    fn = text.slice(0, text.indexOf("@"));
  } else if (/ \($/.test(text.slice(0, place.index))) {
    // Our own cleaned form, "fn (path:line:col)" (frameText): a report the device cleaned, read again by the server (src/errors.ts), keeps its
    // function names. Without this every client frame came back "?", and two errors in one file with one message made one group.
    fn = text.slice(0, place.index).replace(/\($/, "").trim();
  }
  if (!FUNCTION.test(fn)) fn = "";
  // full: the path, to tell whose code it is; path: what's kept of it. A web address keeps its path (never its host or query);
  // any other (file://, a bundle's name) only its file's name.
  let full = place[1];
  let path;
  if (/^[a-z][\w+.-]*:\/\//i.test(full)) {
    try {
      const url = new URL(full);
      full = url.pathname;
      path = url.protocol === "http:" || url.protocol === "https:" ? full : full.split("/").pop() || "?";
    } catch {
      full = path = "?";
    }
  } else {
    full = full.replace(/[?#].*$/, "");
    path = full.startsWith("/") ? full : full.split("/").pop();
  }
  return { fn, full, path, line: Number(place[2]), col: place[3] === undefined ? null : Number(place[3]) };
}

const frameText = (f) => `${f.fn || "?"} (${f.path}:${f.line}${f.col === null ? "" : `:${f.col}`})`;

/**
 * A stack's frames of our own code, as "fn (path:line:col)" lines. own(path) says which are ours, from the frame's whole path:
 * the app's are under /js/; the Worker's are everything but node_modules (in production it's all one bundle, index.js).
 */
export function cleanStack(stack, own) {
  if (typeof stack !== "string") return [];
  const frames = [];
  for (const line of stack.slice(0, 16_000).split("\n")) {
    const frame = readFrame(line);
    if (frame && own(frame.full)) frames.push(frame);
    if (frames.length >= ERROR_LIMITS.frames) break;
  }
  return frames.map(frameText);
}

export const appOwn = (path) => /^\/js\/[\w\-./]+\.m?js$/.test(path);
export const workerOwn = (path) => !path.includes("node_modules") && path !== "?";

/** The browser's name and major version, and the system, from a user agent: "Safari 26 · iOS". Nothing finer. */
export function coarseBrowser(ua) {
  if (typeof ua !== "string" || !ua) return "unknown";
  const major = (re) => re.exec(ua)?.[1] ?? "";
  let name = "other";
  let version = "";
  if (/Edg(?:A|iOS)?\//.test(ua)) (name = "Edge"), (version = major(/Edg(?:A|iOS)?\/(\d+)/));
  else if (/OPR\//.test(ua)) (name = "Opera"), (version = major(/OPR\/(\d+)/));
  else if (/SamsungBrowser\//.test(ua)) (name = "Samsung Internet"), (version = major(/SamsungBrowser\/(\d+)/));
  else if (/Firefox\/|FxiOS\//.test(ua)) (name = "Firefox"), (version = major(/(?:Firefox|FxiOS)\/(\d+)/));
  else if (/CriOS\//.test(ua)) (name = "Chrome"), (version = major(/CriOS\/(\d+)/));
  else if (/Chrome\//.test(ua)) (name = "Chrome"), (version = major(/Chrome\/(\d+)/));
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) (name = "Safari"), (version = major(/Version\/(\d+)/));
  const system = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /CrOS/.test(ua)
        ? "ChromeOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "other";
  return `${name}${version ? ` ${version}` : ""} · ${system}`;
}

/**
 * Where in the app it happened: the path, and the screen by its route's names ("/app/#settings/study"), at most two of them,
 * and only words a route is made of (a pack's id or a search never is one of the first two). The Worker's: a route pattern.
 */
export function cleanPlace(value) {
  if (typeof value !== "string") return "";
  const [path = "", hash = ""] = value.split("#", 2);
  if (!/^(?:[A-Z]+ )?[\w\-/:*.]{1,80}$/.test(path)) return "?";
  const screen = hash.split("/").slice(0, 2);
  const names = [];
  for (const part of screen) {
    if (!/^[a-z][a-z-]{0,23}$/.test(part)) break;
    names.push(part);
  }
  return names.length ? `${path}#${names.join("/")}` : path;
}

const KINDS = new Set(["error", "rejection", "reload", "probe-crash"]);

/**
 * The app started again by itself: what a report of the "reload" kind says, always, whatever a device sends with it. Only its
 * screen (place) and the app's version are its own.
 */
export const RELOAD = Object.freeze({ name: "Reload", message: "The app started again by itself, on this screen." });

/**
 * A native probe that ended the page (speech/probe-guard.js): the probe's name is all it says, one of these, in fixed words; with its screen
 * and the app's version (the browser is the request's, as for every report).
 */
export const PROBE_CRASH = Object.freeze({
  name: "ProbeCrash",
  probes: Object.freeze({ "webgpu-adapter": "asking the GPU for an adapter (WebGPU)", "speech-available": "asking the recognizer whether it has the language on the device" }),
});
const probeCrashMessage = (probe) => `The page ended while ${PROBE_CRASH.probes[probe]}: ${probe}, never asked again on this device.`;

/**
 * Whether this start is the app's page coming back after it ended without being closed: a reload (the navigation's type) of the
 * Home Screen app on a touch screen, which has no reload a person can make there, that the app's own Reload didn't make, of a page
 * last seen on screen. An iPhone reloads the page this way when it ended the page's process (out of memory): nothing the page runs
 * sees that end, so its next start is the only one that can say it. A page last seen hidden ended in the background, where a phone
 * ends apps to free memory: that's no fault anyone saw, and isn't told. lastSeen is "visible", "hidden" or null (not known).
 */
export function startedAgainByItself({ type, installed, touch, own, lastSeen }) {
  return type === "reload" && installed === true && touch === true && own !== true && lastSeen !== "hidden";
}

const cleanVersion = (value) => (typeof value === "string" && /^[\w.\-]{1,24}$/.test(value) ? value : "");

/**
 * A report from the app as it's kept, or null for one not worth keeping: nothing to say, the browser's "Script error." (a
 * script from elsewhere, which hides its error), or an error only in code that isn't ours (a browser extension's). The CSP allows
 * no inline script and no eval, so an error of ours always has a frame under /js/; one with none is someone else's. A rejection
 * with no stack at all (a promise rejected with a string or nothing) can't be told apart, so it's kept. A "reload" is RELOAD's
 * name and words, with no stack, its screen and the app's version: nothing else of the input is read.
 * A "probe-crash" is PROBE_CRASH's: the probe's name (its message, one of PROBE_CRASH.probes) in fixed words, its screen and version; one
 * naming no probe isn't kept.
 *   input: { kind, name, message, stack, file, line, col, place, version } from lx/error-report.js, or anything at all.
 */
export function cleanReport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const kind = KINDS.has(input.kind) ? input.kind : "error";
  if (kind === "reload") return { kind, name: RELOAD.name, message: RELOAD.message, stack: "", place: cleanPlace(input.place), version: cleanVersion(input.version) };
  if (kind === "probe-crash") {
    // The probe's name, or the words a device already cleaned it into (the server cleans what the device sends again, and gets the same).
    const probe = Object.keys(PROBE_CRASH.probes).find((name) => input.message === name || input.message === probeCrashMessage(name));
    if (!probe) return null;
    return { kind, name: PROBE_CRASH.name, message: probeCrashMessage(probe), stack: "", place: cleanPlace(input.place), version: cleanVersion(input.version) };
  }
  const name = typeof input.name === "string" && /^[A-Za-z][\w$]{0,39}$/.test(input.name) ? input.name : "Error";
  const message = cleanMessage(input.message);
  let stack = cleanStack(input.stack, appOwn);
  const file = typeof input.file === "string" ? input.file : "";
  if (!stack.length && file) {
    const frame = readFrame(`${file}:${Number(input.line) || 0}:${Number(input.col) || 0}`);
    if (frame && appOwn(frame.full)) stack = [frameText(frame)];
    else return null; // thrown in someone else's script
  }
  if (!stack.length && (kind === "error" || (typeof input.stack === "string" && input.stack.trim()))) return null;
  if (!message && !stack.length) return null;
  return { kind, name, message, stack: stack.join("\n"), place: cleanPlace(input.place), version: cleanVersion(input.version) };
}

/** The text two reports share when they're the same error: digits made alike, the first frame without its line. */
export function groupKey({ source, kind, name, message, stack, place }) {
  const first = (stack ?? "").split("\n")[0].replace(/:\d+(?::\d+)?\)$/, ")");
  return [source, kind, name, (message ?? "").replace(/\d+/g, "0"), first, first ? "" : place].join("|");
}
