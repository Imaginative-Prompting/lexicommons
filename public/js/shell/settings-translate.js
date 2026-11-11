// Settings → Translate (#settings/translate): the full translator on this device, a language at a time (both ways with
// English), as Settings → Voice and speech keeps Whisper's download. One row per language, its title the same in every
// state ("Dutch ↔ English"), only its sub and its trailing button changing: not here, what the download is and Download;
// waiting for the word packs to come in first, saying so, with Stop; downloading, how far and Stop, its bar under the row; here, what it takes and Remove. Downloaded on this page, the bar
// stays full with Tinta out at its far end for a beat, then the row settles (a press settles it at once). Offline, the row
// says it needs a connection and has no button. A language with none says so. Never "model", "Mozilla" or "AI" on it but
// the group's note, which credits it (translate/translator.js has the rest; lex-design-3, 5 Nov 2026).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { wordsRow } from "./settings.js";
import * as motion from "../lx/motion.js";
import { formatNumber, languageLabel, t } from "../lx/i18n.js";
import { learning } from "../study/learning.js";
import { downloadTranslator, hasFullTranslator, onTranslatorChange, removeTranslator, stopTranslator, translatorChecked, translatorSize, translatorState, translatorsHere } from "../translate/translator.js";

const mb = (bytes) => formatNumber(Math.max(1, Math.round(bytes / 1e6)));
const pairOf = (lang) => t("translate.settings.pair", { language: languageLabel(lang), english: languageLabel("en") });
const SETTLE_MS = 1200;

export function translateSettings(page) {
  const group = ui.el("div");
  let bar = null; // the download's bar, the same one every draw, so Tinta pours on through each redraw
  let came = false; // downloaded on this page: its bar stays, full, Tinta out at its far end, until it settles
  let settling = null; // { timer, ticker } while it does
  const settle = () => {
    if (!settling) return;
    clearTimeout(settling.timer);
    settling = null;
    came = false;
    bar = null;
    render();
  };
  const start = (lang) => {
    settle();
    came = false;
    bar = null;
    downloadTranslator(lang).then(
      () => {
        bar?.done();
        came = true;
        render();
        // A beat with Tinta out at the end, then the plain row. Any press settles it at once (motion's tickers), and with
        // animations off there's no beat at all.
        const hold = { timer: 0, ticker: null };
        settling = hold;
        hold.timer = setTimeout(() => {
          hold.ticker?.end();
          settle();
        }, SETTLE_MS);
        hold.ticker = motion.registerTicker(settle);
      },
      () => render(),
    );
  };
  const small = (words, onclick) => ui.button(words, { variant: "fade", size: "sm", onclick });
  // What the rows were drawn from, but how far the download has got. While it's the same, a draw changes the downloading
  // row's words and bar in place and builds nothing: a press that starts on Stop must end on that same button, and a row
  // built again on every bit of progress (twice a second) handed the finger a new one, so Stop could be lost mid-download.
  let drawn = "";
  let progressWords = null; // the downloading row's sub, its words changed in place
  const render = () => {
    const lang = learning();
    const state = translatorState(lang, "en");
    const shape = JSON.stringify([
      lang,
      translatorsHere().map(({ lang: code, bytes }) => [code, bytes]),
      came && Boolean(bar),
      hasFullTranslator(lang),
      state.state,
      Boolean(state.waiting),
      translatorChecked(),
      navigator.onLine === false,
      translatorSize(lang),
    ]);
    if (shape === drawn) {
      if (state.state === "downloading" && !state.waiting) {
        if (state.size) bar?.set(state.got / state.size);
        if (progressWords) progressWords.textContent = t("translate.settings.downloadingSub", { got: state.got, size: state.size });
      }
      return;
    }
    drawn = shape;
    progressWords = null;
    const rows = [];
    for (const { lang: code, bytes } of translatorsHere()) {
      rows.push(
        ui.listRow({
          title: pairOf(code),
          sub: t("translate.settings.hereSub", { size: mb(bytes) }),
          trailing: small(t("translate.settings.remove"), async () => {
            settle();
            await removeTranslator(code);
            render();
          }),
          below: code === lang && came && bar ? bar : undefined,
        }),
      );
    }
    if (!hasFullTranslator(lang)) rows.push(ui.listRow({ title: t("translate.settings.none", { language: languageLabel(lang) }) }));
    else if (state.state === "downloading" && state.waiting) {
      // Pressed while the word packs are still coming: it starts once they're in; no bar yet.
      rows.push(ui.listRow({ title: pairOf(lang), sub: t("translate.settings.waitingSub"), trailing: small(t("translate.settings.stop"), () => stopTranslator(lang)) }));
    } else if (state.state === "downloading") {
      if (!bar) bar = ui.downloadBar({ label: t("translate.settings.downloadingLabel", { pair: pairOf(lang) }) });
      if (state.size) bar.set(state.got / state.size);
      const row = ui.listRow({
        title: pairOf(lang),
        sub: t("translate.settings.downloadingSub", { got: state.got, size: state.size }),
        trailing: small(t("translate.settings.stop"), () => stopTranslator(lang)),
        below: bar,
      });
      progressWords = row.querySelector(".lx-row-sub");
      rows.push(row);
    } else if (state.state !== "ready" && translatorChecked()) {
      const offline = navigator.onLine === false;
      const failed = state.state === "failed";
      rows.push(ui.listRow({ title: pairOf(lang), sub: offline ? t("translate.settings.needsConnection") : failed ? t("translate.settings.failed") : t("translate.settings.downloadSub", { size: mb(translatorSize(lang)) }) }));
      // The page's one way forward: solid, under its row.
      if (!offline) rows.push(el("li", { class: "lx-row-item lx-row-go" }, ui.button(failed ? t("translate.settings.retry") : t("translate.settings.download"), { variant: "go", size: "lg", block: true, onclick: () => start(lang) })));
    }
    // What the translator is and whose it is, a press away.
    group.replaceChildren(ui.group(null, rows), el("ul", { part: "list" }, wordsRow(t("translate.settings.aboutTitle"), t("translate.settings.about"))));
  };
  page.replaceChildren(ui.pageTitle(t("translate.settings.title")), group);
  render();
  const stop = onTranslatorChange(render);
  const online = () => render();
  addEventListener("online", online);
  addEventListener("offline", online);
  return {
    title: t("translate.settings.title"),
    dispose: () => {
      if (settling) {
        clearTimeout(settling.timer);
        settling.ticker?.end();
        settling = null;
      }
      stop();
      removeEventListener("online", online);
      removeEventListener("offline", online);
    },
  };
}
