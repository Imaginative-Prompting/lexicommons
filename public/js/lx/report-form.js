// Sending a bug report (lx/bug-rules.js; src/bug-reports.ts keeps it), the same from Settings → Report a bug (shell/settings-report.js)
// and from the sign-in pages when someone can't get in (report.js, signed out): what comes along, as the person sees it before it goes;
// a screenshot redrawn on the device first; the request. It draws nothing and has no words of its own: each page brings its own (Settings'
// through t(), the sign-in pages' the same English entries, written into the page by src/pages.ts). It imports no more than the rules, so
// the signed-out page stays small.

import { BUG_LIMITS, cleanContext, SCREENSHOT_TYPES } from "./bug-rules.js";
import { coarseBrowser } from "./error-clean.js";

/** The kind of device: a touch screen's shorter side under 600 px a phone, over it a tablet; no touch screen, a computer. */
export function deviceKind() {
  try {
    if (!matchMedia("(pointer: coarse)").matches) return "computer";
    return Math.min(screen.width, screen.height) < 600 ? "phone" : "tablet";
  } catch {
    return "";
  }
}

/** Whether this is the installed app (from the Home Screen), not a browser's tab. */
export function installedApp() {
  try {
    return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  } catch {
    return false;
  }
}

/** The app's version, as this page's own scripts carry it (?v=). */
export function pageVersion() {
  try {
    const script = document.querySelector('script[type="module"][src*="?v="]');
    return script ? new URL(script.src, location.href).searchParams.get("v") ?? "" : "";
  } catch {
    return "";
  }
}

/** What comes along, as it's sent (lx/bug-rules.js cleanContext): screen is a path and its route ("/app/#study/session"). */
export const reportContext = ({ screen, learning = "", speaks = "" }) =>
  cleanContext({ screen: String(screen ?? "").split("?")[0], version: pageVersion(), device: deviceKind(), installed: installedApp(), learning, speaks });

/** The browser as the server will name it (error-clean.js coarseBrowser: "Safari 26 · iOS"). */
export const browserName = () => coarseBrowser(navigator.userAgent);

/** A screenshot that can't be sent: kind "unreadable" (this browser can't open it) or "big" (too big even scaled down). */
export class ScreenshotError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

const blobOf = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * A picture from the device, ready to send: always redrawn here, which leaves behind whatever a photo's file carries besides the picture
 * (where it was taken, the camera); a PNG kept a PNG while it's small enough, so a screenshot's words stay sharp, else scaled down to
 * BUG_LIMITS.screenshotSide and smaller until it's under BUG_LIMITS.screenshotTarget, as WebP (JPEG where the browser can't write WebP).
 */
export async function shrinkScreenshot(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ScreenshotError("unreadable");
  }
  try {
    const side = Math.max(bitmap.width, bitmap.height);
    for (const maxSide of [BUG_LIMITS.screenshotSide, 1600, 1200]) {
      const scale = Math.min(1, maxSide / side);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (file.type === "image/png") {
        const png = await blobOf(canvas, "image/png");
        if (png && png.size <= BUG_LIMITS.screenshotTarget) return png;
      }
      for (const quality of [0.86, 0.72]) {
        let blob = await blobOf(canvas, "image/webp", quality);
        // Safari can't write WebP and hands back a PNG instead; JPEG stays small.
        if (!blob || blob.type !== "image/webp") blob = await blobOf(canvas, "image/jpeg", quality);
        if (blob && SCREENSHOT_TYPES.includes(blob.type) && blob.size <= BUG_LIMITS.screenshotTarget) return blob;
      }
    }
  } finally {
    bitmap.close?.();
  }
  throw new ScreenshotError("big");
}

/**
 * Sends a report: { ok: true }, or { ok: false, offline } when it never got an answer, or { ok: false, status, message } with the server's
 * words (null when it gave none to show).
 */
export async function sendReport({ text, context, screenshot = null }) {
  const form = new FormData();
  form.set("text", text);
  form.set("context", JSON.stringify(context));
  if (screenshot) form.set("screenshot", screenshot, "screenshot");
  let response;
  try {
    response = await fetch("/api/bug-reports", { method: "POST", body: form, credentials: "same-origin", cache: "no-store" });
  } catch {
    return { ok: false, offline: true };
  }
  if (response.ok) return { ok: true };
  let message = null;
  try {
    const body = await response.json();
    message = typeof body?.error === "string" && /\s/.test(body.error) ? body.error : null;
  } catch {}
  return { ok: false, status: response.status, message };
}

/** A size for people: 412 KB, 1.2 MB. */
export const sizeWords = (bytes) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`);
