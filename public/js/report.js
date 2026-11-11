// Report a bug from the sign-in pages, for someone who isn't signed in (src/pages.ts reportPage, at /report): the same report as Settings →
// Report a bug, through lx/report-form.js, in the same English words (the Settings catalog's own entries: the sign-in pages are in English).
// What goes along is filled in here, before anything is sent: the page of this site the person came from (its path only), the app's
// version, the device and browser, and the languages this device last had. The account row already says none.
import words from "./i18n/en/settings.js";
import { browserName, reportContext, ScreenshotError, sendReport, shrinkScreenshot, sizeWords } from "./lx/report-form.js";

const say = (key, vars = {}) => words[key][0].replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
const DEVICE_WORDS = { phone: "settings.report.phone", tablet: "settings.report.tablet", computer: "settings.report.computer" };
// The page someone came from, by the name it goes by (its path is what's sent): the sign-in pages that link here, and this page itself.
const SCREEN_WORDS = {
  "/login": "settings.report.screenSignIn",
  "/login/recover": "settings.report.screenRecover",
  "/login/new": "settings.report.screenNew",
  "/authorize": "settings.report.screenConnect",
  "/report": "settings.report.title",
};

/** The page of this site the person came here from (the sign-in page, say), by its path alone; this page's own when there's none. */
function cameFrom() {
  try {
    const from = new URL(document.referrer);
    if (from.origin === location.origin && from.pathname !== location.pathname) return from.pathname;
  } catch {}
  return location.pathname;
}

/** The languages this device last had (study/learning.js keeps them as lx.learning.v1), if any. */
function languages() {
  try {
    const kept = JSON.parse(localStorage.getItem("lx.learning.v1") ?? "null");
    if (kept && typeof kept.lang === "string" && typeof kept.from === "string") return { learning: kept.lang, speaks: kept.from };
  } catch {}
  return { learning: "", speaks: "" };
}

function languageName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const form = document.getElementById("report-form");
const box = form.elements.namedItem("text");
const shot = document.getElementById("report-shot");
const input = document.getElementById("report-file");
const sentNotice = document.getElementById("report-sent");
const errorNotice = document.getElementById("report-error");
const { learning, speaks } = languages();
const context = reportContext({ screen: cameFrom(), learning, speaks });
// The app's version, not this page's: the sign-in pages carry their own (src/pages.ts V), and the app's is the service worker's shell
// (public/sw.js VERSION, "shell-631"), which the site gate lets through. Not known if it can't be read; never this page's own.
context.version = "";
const versionRead = fetch("/sw.js", { cache: "no-store" })
  .then((r) => (r.ok ? r.text() : ""))
  .then((text) => {
    context.version = /\bVERSION = "shell-(\d+)"/.exec(text)?.[1] ?? "";
  })
  .catch(() => {})
  .finally(() => fill("version", context.version));
let screenshot = null;
let preview = null;
let busy = false;

// What goes along, as it will be sent.
const fill = (along, value) => {
  const node = form.querySelector(`[data-along="${along}"]`);
  if (node) node.textContent = value || say("settings.report.unknown");
};
fill("screen", SCREEN_WORDS[context.screen] ? say(SCREEN_WORDS[context.screen]) : "");
fill("device", [context.device ? say(DEVICE_WORDS[context.device]) : null, browserName(), context.installed ? say("settings.report.installed") : null].filter(Boolean).join(" · "));
// The device's own choice only: none picked on it, none sent.
fill("languages", context.learning && context.speaks ? say("settings.report.languagesValue", { learning: languageName(context.learning), speaks: languageName(context.speaks) }) : say("settings.report.languagesNone"));
// The page's words the server wrote come from the same entries; written again here, so this page's words have one source.
fill("account", say("settings.report.accountNone"));
const lead = document.getElementById("report-lead");
if (lead) lead.textContent = say("settings.report.signedOutLead");
const signIn = document.querySelector('.lx-signin-foot a[href="/login"]');
if (signIn) signIn.textContent = say("settings.report.signInLink");

/** One message at a time: right (sent) or wrong, or none. */
function tell(meaning, text) {
  for (const [node, mine] of [[sentNotice, "right"], [errorNotice, "wrong"]]) {
    const on = meaning === mine && Boolean(text);
    node.hidden = !on;
    if (on) node.querySelector('[data-part="feedback-title"]').textContent = text;
  }
}

const button = (text, onclick) => {
  const node = document.createElement("button");
  node.type = "button";
  node.dataset.part = "button";
  node.dataset.variant = "fade";
  node.dataset.size = "sm";
  node.textContent = text;
  node.addEventListener("click", onclick);
  return node;
};

// The screenshot: Add a screenshot; once picked, its row with its picture, its size and Remove.
const addButton = document.getElementById("report-add");
addButton?.addEventListener("click", () => input.click());
function drawShot() {
  if (preview) URL.revokeObjectURL(preview);
  preview = null;
  if (!screenshot) {
    shot.replaceChildren(...(addButton ? [addButton] : []));
    return;
  }
  preview = URL.createObjectURL(screenshot);
  const list = document.createElement("ul");
  list.dataset.part = "list";
  const row = document.createElement("li");
  row.dataset.part = "list-row";
  const lead = document.createElement("span");
  lead.className = "lx-row-icon";
  lead.dataset.art = "";
  const picture = document.createElement("img");
  picture.className = "lx-report-thumb";
  picture.src = preview;
  picture.alt = "";
  lead.append(picture);
  const text = document.createElement("span");
  text.className = "lx-row-text";
  const title = document.createElement("span");
  title.className = "lx-row-title";
  title.textContent = say("settings.report.screenshot", { size: sizeWords(screenshot.size) });
  text.append(title);
  row.append(lead, text, button(say("settings.report.removeScreenshot"), () => ((screenshot = null), drawShot())));
  list.append(row);
  shot.replaceChildren(list);
}
input.addEventListener("change", async () => {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    screenshot = await shrinkScreenshot(file);
    tell(null);
  } catch (error) {
    screenshot = null;
    tell("wrong", say(error instanceof ScreenshotError && error.kind === "big" ? "settings.report.screenshotBig" : "settings.report.screenshotUnreadable"));
  }
  drawShot();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  // A press while one is on its way does nothing more.
  if (busy) return;
  if (!box.value.trim()) {
    tell("wrong", say("settings.report.empty"));
    box.focus();
    return;
  }
  busy = true;
  tell(null);
  // On its way: the button says so (no mark beside it until there's an answer).
  const submit = form.querySelector('button[type="submit"]');
  const words = submit.textContent;
  submit.textContent = say("settings.report.sending");
  try {
    await versionRead;
    const sent = await sendReport({ text: box.value, context, screenshot });
    if (sent.ok) {
      box.value = "";
      screenshot = null;
      drawShot();
      tell("right", say("settings.report.sent"));
    } else tell("wrong", sent.offline ? say("settings.report.offline") : (sent.message ?? say("settings.report.failed")));
  } finally {
    submit.textContent = words;
    busy = false;
  }
});
