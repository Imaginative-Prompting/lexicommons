// What a bug report is, the same on the device and the server (src/bug-reports.ts keeps them; shell/settings-report.js sends them from
// Settings, report.js from the sign-in pages when someone can't get in): its limits, the screenshot's kinds and how its own bytes say which
// it is, and what comes along with what's written. What comes along is shown before it's sent and is never anyone's secret: the screen by
// its route names only (error-clean.js cleanPlace: no ids, nothing typed, no query), the app's version, a kind of device, whether it's the
// installed app, and the two languages' codes. The browser is read from the request on the server (error-clean.js coarseBrowser).

import { cleanPlace } from "./error-clean.js";

export const BUG_LIMITS = Object.freeze({
  /** What happened, in characters (code points), and the fewest that say anything. */
  text: 2000,
  textMin: 3,
  /** The screenshot's bytes (an admin sees it over MCP, as get_look_image shows a look's); the device scales a bigger one down first,
   *  to under screenshotTarget (report-form.js shrinkScreenshot). */
  screenshotBytes: 2_000_000,
  screenshotTarget: 1_500_000,
  /** The longest side the device keeps when it scales one down. */
  screenshotSide: 2000,
  /** The whole request: the screenshot, what's written (6 bytes a character at most), and room for the rest. */
  body: 2_000_000 + 2000 * 6 + 16 * 1024,
});

export const SCREENSHOT_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
export const DEVICES = Object.freeze(["phone", "tablet", "computer"]);

/** What a file's own first bytes say it is (PNG, JPEG or WebP), or null: its name and declared type count for nothing. */
export function imageTypeOf(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const at = (i, ...values) => values.every((v, k) => b[i + k] === v);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** What's written, as it's kept: line breaks as \n, no control characters, trimmed; and its length in characters. */
export function cleanText(value) {
  const text = (typeof value === "string" ? value : "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200d\u2028\u2029\ufeff]/g, "")
    .trim();
  return { text, length: [...text].length };
}

const VERSION = /^[\w.-]{1,32}$/;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

/**
 * What comes along, as it's kept: { screen, version, device, installed, learning, speaks }. Anything that isn't what it should be is left
 * blank, never refused: it's ours to read, not theirs to get right. A screen is its route names (cleanPlace), never longer than 120.
 */
export function cleanContext(input) {
  const value = input && typeof input === "object" ? input : {};
  const text = (v) => (typeof v === "string" ? v : "");
  const screen = cleanPlace(text(value.screen).slice(0, 200));
  return {
    screen: screen === "?" ? "" : screen.slice(0, 120),
    version: VERSION.test(text(value.version)) ? text(value.version) : "",
    device: DEVICES.includes(value.device) ? value.device : "",
    installed: value.installed === true,
    learning: LANGUAGE.test(text(value.learning)) ? text(value.learning) : "",
    speaks: LANGUAGE.test(text(value.speaks)) ? text(value.speaks) : "",
  };
}
