// Putting Lexicommons on your Home Screen: Settings → Add to Home Screen (#settings/install, or #settings/install/<id>
// for one device's steps), the row Today shows on a phone that hasn't added it yet, and whether it's installed.
// Which device and browser this is, and each one's steps, come from install-guide.js (pure). Where the browser offers
// its own install prompt (Chrome and Edge, beforeinstallprompt), the page's first button is that prompt.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { BUTTONS, PLATFORMS, detect, platformById } from "./install-guide.js";

const DISMISSED = "lx.install.dismissed";

/** Whether Lexicommons is open as an installed app (from the Home Screen, the Dock, or as an app window). */
export const isInstalled = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;

/** This device and browser: install-guide.js detect() on what the browser says about itself. */
export const thisDevice = () => detect({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0, standalone: isInstalled() });

/** One step, its buttons drawn as their glyph and name. */
function stepNode(pieces, n) {
  return el(
    "li",
    { part: "install-step" },
    el("span", { class: "lx-step-n", "aria-hidden": "true" }, String(n)),
    el(
      "span",
      { class: "lx-step-text" },
      pieces.map((piece) => (typeof piece === "string" ? piece : el("span", { part: "install-key" }, icon(BUTTONS[piece.key] ?? "more"), piece.label))),
    ),
  );
}

/** A device's steps, as a numbered list. */
export const installSteps = (platform) => el("ol", { part: "install-steps", "aria-label": platform.title }, platform.steps.map((pieces, i) => stepNode(pieces, i + 1)));

// ---------- the row on Today ----------

/**
 * The row Today shows in Keep going on a phone or tablet that hasn't added Lexicommons yet, once you've finished
 * something (web.dev's advice: after a sign of interest, never in the way), until you add it or say Not now (kept on
 * this device; Settings → About still has the steps). onDismiss is called after Not now. null when it shouldn't show.
 */
export function installRow({ finishedSomething, onDismiss }) {
  const offer = installOffer({ finishedSomething });
  return offer
    ? installRowNode({
        inApp: offer.inApp,
        onDismiss: () => {
          offer.dismiss();
          onDismiss?.();
        },
      })
    : null;
}

/** Whether to offer adding Lexicommons to the Home Screen (Home's card): { inApp, dismiss } on a phone that hasn't, once something's finished, until Not now; else null. */
export function installOffer({ finishedSomething }) {
  const device = thisDevice();
  if (!device.mobile || device.installed || !finishedSomething) return null;
  try {
    if (localStorage.getItem(DISMISSED)) return null;
  } catch {}
  return {
    inApp: device.id === "in-app",
    dismiss: () => {
      try {
        localStorage.setItem(DISMISSED, String(Date.now()));
      } catch {}
    },
  };
}

/** The row itself (also /design's demo): the way to the steps, and Not now beside it. */
export function installRowNode({ inApp = false, onDismiss, href = "#settings/install?from=today" } = {}) {
  const row = ui.listRow({
    icon: "plus-square",
    title: inApp ? "Open Lexicommons in your browser" : "Add Lexicommons to your Home Screen",
    sub: inApp ? "Then add it to your Home Screen" : "It opens full screen, like an app",
    href,
  });
  row.classList.add("lx-install-row");
  row.append(ui.iconButton("cross", "Not now", { onclick: () => onDismiss?.() }));
  return row;
}

// ---------- Settings → Add to Home Screen ----------

/**
 * #settings/install: this device's steps (or the browser's own install button), and "Find your device's steps" for any
 * other. #settings/install/<id>: one device's steps. params.from = "today": Back goes to Today.
 */
export function installSettings(page, id, ctx, params = {}) {
  const device = thisDevice();
  const back = params.from === "today" ? { href: "#today", label: "Home" } : id ? { href: "#settings/install", label: "Add to Home Screen" } : { href: "#settings/about", label: "About" };
  if (id) {
    const platform = platformById(id);
    if (!platform) {
      page.replaceChildren(ui.pageTitle("Add to Home Screen"), ui.emptyState("There are no steps for that device.", { pose: "shrug" }));
      return { title: "Add to Home Screen", back };
    }
    page.replaceChildren(...[ui.pageTitle(platform.title), installSteps(platform), platform.note ? el("p", { part: "group-note" }, platform.note) : null].filter(Boolean));
    return { title: platform.title, back };
  }
  const mine = platformById(device.id);
  const prompt = ctx.installPrompt?.();
  const top = [];
  if (device.installed) {
    top.push(ui.emptyState([icon("check"), "You're using Lexicommons as an app on this device."], { react: "right", class: "lx-install-done" }));
  } else {
    if (prompt) {
      top.push(
        ui.button("Install Lexicommons", {
          variant: "go",
          block: true,
          onclick: async () => {
            prompt.prompt();
            await prompt.userChoice.catch(() => {});
          },
        }),
      );
    }
    if (mine) top.push(el("h2", { part: "group-label" }, prompt ? `Or by hand: ${mine.title[0].toLowerCase()}${mine.title.slice(1)}` : mine.title), installSteps(mine), mine.note ? el("p", { part: "group-note" }, mine.note) : null);
    else if (!prompt) top.push(el("p", { part: "group-note" }, "We couldn't tell which device and browser this is. Find yours below."));
  }
  const others = PLATFORMS.filter((p) => p.id !== mine?.id).map((p) => ui.listRow({ title: `${p.device === "computer" ? "Computer" : p.device}${p.browser ? `, ${p.browser}` : ""}`, href: `#settings/install/${p.id}` }));
  const find = el(
    "details",
    { class: "lx-install-find" },
    el("summary", { part: "list-row" }, el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, "Find your device's steps")), icon("chevron")),
    el("ul", { part: "list" }, others),
  );
  // (replaceChildren would write a null as the text "null": only nodes go in.)
  page.replaceChildren(
    ui.pageTitle("Add to Home Screen", "It opens full screen, like an app, and works offline."),
    ...top.filter(Boolean),
    el("section", { class: "lx-group" }, find),
  );
  return { title: "Add to Home Screen", back };
}

/** The row Settings → About shows: the steps, or that it's installed. */
export const installAboutRow = () => {
  const device = thisDevice();
  return ui.listRow({ title: "Add to Home Screen", value: device.installed ? "Added" : undefined, href: "#settings/install" });
};
