// Grammar suggestions' way in, from where an idea is met: Knowledge's ideas open their sheet (study/after-answer.js conceptSheet), and its
// foot has a row to suggest a better explanation of it, for everyone learning the language. Only for a pattern, and only while learners can
// share (shell/sharing.js), as Explore's Share. The suggestion's sheet is Explore's own (grammar.js suggestFix), loaded when it's pressed;
// this idea's sheet closes first (one sheet at a time). A session's sheets have none: suggesting is never in the middle of studying.
import * as ui from "../lx/ui.js";
import { t } from "../lx/i18n.js";
import { languageName } from "../lang/index.js";
import { contentLanguage } from "../study/content.js";
import { mayShare, sharingOpen } from "../shell/sharing.js";

/** conceptSheet's `extra` for a unit ("p:<pattern id>"): ({ close }) → the row, or null where there's none. */
export function suggestWay(unit) {
  if (typeof unit !== "string" || !unit.startsWith("p:") || !(sharingOpen() && mayShare())) return null;
  const id = unit.slice(2);
  return ({ close }) => {
    const lang = contentLanguage();
    return ui.group(null, [
      ui.listRow({
        icon: "pencil",
        title: t("explore.suggestWay.title"),
        sub: t("explore.suggestWay.sub", { language: languageName(lang) }),
        opens: "sheet",
        onclick: async () => {
          close();
          (await import("./grammar.js")).suggestFix(lang, id);
        },
      }),
    ]);
  };
}
