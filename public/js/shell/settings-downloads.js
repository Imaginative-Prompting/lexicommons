// Settings → Downloads (#settings/downloads, the 6 Nov audit): everything that takes room on this phone, each with its size and Remove: the full
// translator for each language it's here for, Whisper's models (Speaking), and the recordings kept for offline. Getting them stays where
// each is used (Translate offers its translator, Speaking its Whisper); this is where they're seen and let go.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { formatNumber, languageLabel, t } from "../lx/i18n.js";
import { onTranslatorChange, removeTranslator, translatorsHere } from "../translate/translator.js";
import { MODELS } from "../speech/models.js";
import { speechApi } from "../study/speaking.js";
import { CLIPS } from "../study/keep-clips.js";

const mbOf = (bytes) => formatNumber(Math.max(1, Math.round((bytes ?? 0) / 1_000_000)));
const mb = (bytes) => t("settings.downloads.size", { size: mbOf(bytes) });
// A row's own action, quiet at its end, asking once before it removes (a press, then "Remove it", as Account's Remove does). A
// removal that fails says so in the page's status line and asks again from the start.
function removeButton(onremove, status) {
  let sure = false;
  const button = ui.button(t("settings.downloads.remove"), {
    variant: "fade",
    size: "sm",
    onclick: async () => {
      if (!sure) {
        sure = true;
        button.replaceChildren(t("settings.downloads.removeSure"));
        return;
      }
      try {
        await onremove();
      } catch (error) {
        sure = false;
        button.replaceChildren(t("settings.downloads.remove"));
        status.textContent = error?.message || t("settings.downloads.failed");
      }
    },
  });
  return button;
}

/** How much the kept recordings take, by what each says it is (no body read): bytes, or null with none kept. */
async function keptRecordings() {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CLIPS);
  const keys = await cache.keys();
  if (!keys.length) return null;
  let bytes = 0;
  for (const request of keys) {
    const response = await cache.match(request);
    bytes += Number(response?.headers.get("content-length")) || 0;
  }
  return { count: keys.length, bytes };
}

/** back: where its Back goes (Settings, or Speaking when it came from there). */
export function downloadsPage(page, back) {
  const list = el("ul", { part: "list" });
  // With nothing at all, where the big ones come from is said under Tinta's words; with only recordings, under the list.
  const empty = ui.emptyState([t("settings.downloads.none"), el("span", { class: "lx-empty-more" }, t("settings.downloads.more"))], { pose: "box" });
  empty.hidden = true;
  list.hidden = true;
  const status = el("p", { class: "lx-small lx-muted", role: "status" });
  // Under the title, what it all takes; under the list, when neither big download is here, where they come from. The router holds the page
  // until its first draw is in (view.ready, 400 ms at most); slower than that (a phone opening its speech store), the total and the list
  // come into held places, never popping in.
  const total = el("p", { class: "lx-muted" }, ui.held({ inline: true, width: "9ch" }, "downloads-total"));
  let first = true;
  const more = el("p", { part: "group-note" }, t("settings.downloads.more"));
  more.hidden = true;
  let gone = false;
  const draw = async () => {
    const rows = [];
    let bytes = 0;
    let big = false;
    for (const { lang, bytes: size } of translatorsHere()) {
      bytes += size ?? 0;
      big = true;
      rows.push(ui.listRow({ title: t("settings.downloads.translator", { language: languageLabel(lang) }), sub: mb(size), trailing: removeButton(async () => ((await removeTranslator(lang)), draw()), status) }));
    }
    const api = await speechApi().catch(() => null);
    if (api) {
      for (const model of MODELS) {
        const state = await api.modelState(model.id).catch(() => null);
        if (!state || (state.state !== "ready" && state.state !== "partial")) continue;
        bytes += (state.state === "ready" ? state.total : state.have) ?? 0;
        big = true;
        rows.push(ui.listRow({ title: t("settings.downloads.whisper", { model: model.name.toLowerCase() }), sub: state.state === "ready" ? mb(state.total) : t("settings.downloads.partial", { have: mbOf(state.have), total: mbOf(state.total) }), trailing: removeButton(async () => ((await api.deleteModel(model.id)), draw()), status) }));
      }
    }
    const kept = await keptRecordings().catch(() => null);
    if (kept) {
      bytes += kept.bytes;
      rows.push(
        ui.listRow({
          title: t("settings.downloads.recordings"),
          // True to what Remove does: the next update of the packs keeps them again, unless you're saving data.
          sub: t("settings.downloads.recordingsSub", { count: kept.count, size: mbOf(kept.bytes) }),
          trailing: removeButton(async () => ((await caches.delete(CLIPS)), draw()), status),
        }),
      );
    }
    if (gone) return;
    if (first) {
      first = false;
      ui.arrive(place, content);
    }
    ui.arriveIn(total, t("settings.downloads.total", { size: mbOf(bytes) }));
    total.hidden = !rows.length;
    more.hidden = big || !rows.length;
    empty.hidden = rows.length > 0;
    list.hidden = !rows.length;
    list.replaceChildren(...rows);
  };
  const head = ui.pageTitle(t("settings.downloads.title"));
  head.append(total);
  const content = el("div", { class: "lx-stack" }, el("section", { class: "lx-group" }, list), empty, more);
  const place = ui.held({ height: 72 }, "downloads");
  page.replaceChildren(head, place, status);
  const drawn = draw();
  const stop = onTranslatorChange(() => draw());
  return {
    title: t("settings.downloads.title"),
    back,
    ready: drawn,
    dispose() {
      gone = true;
      stop?.();
    },
  };
}
