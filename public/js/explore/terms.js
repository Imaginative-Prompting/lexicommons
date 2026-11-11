// The sharing terms: what they say (their page in Explore, and the asking), and the asking itself, where someone first
// contributes. It sits in the sheet they're writing in, so what they wrote stays and goes on once they've agreed; it never
// sends them to another page. The server still refuses anything sent without them (community.ts mayShare).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t } from "../lx/i18n.js";
import { api, post } from "../shell/api.js";

/** The terms' four lines: each said in bold and explained under it, nothing boxed and no symbols (they did no job). */
export const termsGroup = (licence) =>
  el("ol", { class: "lx-terms", "aria-label": t("explore.terms.label") },
    [
      [t("explore.terms.licence", { licence }), t("explore.terms.licenceSub")],
      [t("explore.terms.yours"), t("explore.terms.yoursSub")],
      [t("explore.terms.name"), t("explore.terms.nameSub")],
      [t("explore.terms.report"), t("explore.terms.reportSub")],
    ].map(([head, sub]) => el("li", {}, el("b", {}, head), el("span", {}, sub))));

/**
 * Whether to go on with a first contribution: true once the terms are accepted, asking in `within` (what's in a sheet) if they
 * aren't yet, over what it shows; false when they'd rather not, with `within` as it was. If the server can't be reached it's
 * true, and the sending says so in its own words.
 */
export async function termsFirst(within, { from } = {}) {
  let terms;
  try {
    terms = await api("/api/community/terms");
  } catch {
    return true;
  }
  if (terms.accepted) return true;
  return new Promise((resolve) => {
    const shown = [...within.children].map((child) => [child, child.hidden]);
    const status = el("p", { class: "lx-small", role: "status" });
    const finish = (answer) => {
      ask.remove();
      for (const [child, hidden] of shown) child.hidden = hidden;
      resolve(answer);
    };
    const agree = ui.button("I agree", { variant: "go", block: true });
    let agreeing = false;
    agree.addEventListener("click", async () => {
      if (agreeing) return;
      agreeing = true;
      try {
        await post("/api/community/terms", { version: terms.version });
        finish(true);
      } catch (error) {
        agreeing = false;
        status.replaceChildren(error instanceof TypeError ? "Lexicommons couldn't be reached. Try again in a moment." : error.message);
      }
    });
    const notNow = ui.button("Not now", { block: true });
    notNow.addEventListener("click", () => {
      finish(false);
      setTimeout(() => from?.focus(), 0);
    });
    const ask = el("div", { class: "lx-stack" }, el("p", {}, "Everything in Explore is shared with everyone. This is asked once."), termsGroup(terms.licence), ui.pinnedActions([agree, notNow], { status }));
    for (const [child] of shown) child.hidden = true;
    within.append(ask);
    agree.focus();
  });
}

/**
 * A report's reasons, the same way in every report: each a row with its name, and the one chosen says what it means just
 * under them (nothing to read before choosing, nothing lost). reasons: [[value, title, what it means]]; onpick(value).
 */
export function reasonPicker(reasons, name, onpick) {
  const note = el("p", { part: "group-note", "aria-live": "polite" });
  const rows = reasons.map(([value, title, sub]) =>
    ui.radioRow({
      title,
      name,
      value,
      onchange: () => {
        note.replaceChildren(sub ?? "");
        onpick(value);
      },
    }),
  );
  return el("div", { class: "lx-report-reasons" }, el("ul", { part: "list" }, rows), note);
}
