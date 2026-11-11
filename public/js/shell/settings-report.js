// Settings → Report a bug (#settings/report): one box for what happened, a screenshot if they want one, and what goes along with it, shown
// before it's sent and never hidden (lx/report-form.js; the server's rules in lx/bug-rules.js, src/bug-reports.ts). The screen it names is
// the one before Settings was opened (main.js ctx.lastScreen). Someone signed out reports from the sign-in pages instead (report.js).
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t } from "../lx/i18n.js";
import { statusLine } from "../lx/appearance.js";
import { BUG_LIMITS } from "../lx/bug-rules.js";
import { browserName, reportContext, ScreenshotError, sendReport, shrinkScreenshot, sizeWords } from "../lx/report-form.js";
import { learning, learningFrom, learningFromName, learningName } from "../study/learning.js";

const DEVICE_WORDS = { phone: "settings.report.phone", tablet: "settings.report.tablet", computer: "settings.report.computer" };

/** What goes along, in words: the summary's rows. The screen by the name the app gives it (main.js PAGES: "Study"); its route is what's sent. */
function summaryRows(context, screenName) {
  const unknown = t("settings.report.unknown");
  const device = [context.device ? t(DEVICE_WORDS[context.device]) : null, browserName(), context.installed ? t("settings.report.installed") : null].filter(Boolean).join(" · ");
  const row = (title, value) => ui.listRow({ title, value: value || unknown });
  return [
    row(t("settings.report.screen"), screenName),
    row(t("settings.report.version"), context.version),
    row(t("settings.report.device"), device),
    row(t("settings.report.languages"), context.learning && context.speaks ? t("settings.report.languagesValue", { learning: learningName(), speaks: learningFromName() }) : ""),
    row(t("settings.report.account"), t("settings.report.accountYours")),
  ];
}

export function reportPage(page, ctx) {
  const title = t("settings.report.title");
  const status = statusLine();
  const context = reportContext({ screen: ctx.lastScreen, learning: learning(), speaks: learningFrom() });
  const box = el("textarea", { part: "text-field", name: "text", rows: 6, maxlength: BUG_LIMITS.text, placeholder: t("settings.report.placeholder"), autocapitalize: "sentences", "aria-label": t("settings.report.what") });
  let screenshot = null;
  let preview = null;
  let busy = false;

  // The screenshot: a picker behind a button; once picked, its row with its picture, its size and Remove.
  const input = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/heic,image/heif", hidden: true });
  const shot = el("div", { class: "lx-report-shot" });
  const drawShot = () => {
    if (preview) URL.revokeObjectURL(preview);
    preview = screenshot ? URL.createObjectURL(screenshot) : null;
    shot.replaceChildren(
      screenshot
        ? el(
            "ul",
            { part: "list" },
            ui.listRow({
              art: el("img", { class: "lx-report-thumb", src: preview, alt: "" }),
              title: t("settings.report.screenshot", { size: sizeWords(screenshot.size) }),
              trailing: ui.button(t("settings.report.removeScreenshot"), { variant: "fade", size: "sm", onclick: () => ((screenshot = null), drawShot()) }),
            }),
          )
        : ui.button(t("settings.report.addScreenshot"), { variant: "fade", size: "sm", icon: "plus", onclick: () => input.click() }),
    );
  };
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      screenshot = await shrinkScreenshot(file);
      status.say("");
    } catch (error) {
      screenshot = null;
      status.say(t(error instanceof ScreenshotError && error.kind === "big" ? "settings.report.screenshotBig" : "settings.report.screenshotUnreadable"), "wrong");
    }
    drawShot();
  });
  drawShot();

  const form = el(
    "form",
    { class: "lx-stack lx-report-form", novalidate: "" },
    el("label", { part: "field" }, el("span", {}, t("settings.report.what")), box),
    shot,
    input,
    el("p", { class: "lx-small lx-muted lx-report-along" }, t("settings.report.sentAlong")),
    Object.assign(ui.group(null, summaryRows(context, ctx.lastTabName)), { className: "lx-group lx-report-summary" }),
    ui.button(t("settings.report.send"), { variant: "go", size: "lg", block: true, type: "submit" }),
    status,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // A press while one is on its way does nothing more.
    if (busy) return;
    if (!box.value.trim()) {
      status.say(t("settings.report.empty"), "wrong");
      box.focus();
      return;
    }
    busy = true;
    status.say(t("settings.report.sending"));
    try {
      const sent = await sendReport({ text: box.value, context, screenshot });
      if (sent.ok) {
        box.value = "";
        screenshot = null;
        drawShot();
        status.say(t("settings.report.sent"), "right");
      } else status.say(sent.offline ? t("settings.report.offline") : (sent.message ?? t("settings.report.failed")), "wrong");
    } finally {
      busy = false;
    }
  });

  page.replaceChildren(ui.pageTitle(title), form);
  return {
    title,
    dispose: () => {
      if (preview) URL.revokeObjectURL(preview);
    },
  };
}
