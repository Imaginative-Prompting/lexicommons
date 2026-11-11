// The app's side of the theme engine's safety net:
// - a usability check: a look that hides the header, the page, the tabs or the way into Settings, or makes the text
//   the color of the page, is undone at once (theme.addUsabilityCheck);
// - a toast with Undo after the look changes in one go (switching theme, an import, a restore, starting over), when a
//   change to a built-in theme starts a theme of yours, or after a look was undone because it broke the page;
// - safe mode's banner (/app/?safe: the look is kept but not applied, so a broken one can be fixed);
// - syncing the look with the account (lx/look-sync.js), so the person's AI can change it and their devices follow.

import * as theme from "../lx/theme.js";
import * as motion from "../lx/motion.js";
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { contrast, visible } from "../lx/appearance.js";
import { startLookSync } from "../lx/look-sync.js";
import { aiConnected, onLayoutChange } from "./layout.js";

const TOAST_MS = 8000;

const SAID = {
  import: (change) => `Added ${change.label || "the theme"} to your themes`,
  restore: () => "Look restored",
  reset: () => "Look reset",
  switch: (change) => `Now using ${change.label || "that theme"}`,
};

let showToast = null;

/**
 * Shows a toast at the bottom of the app (once watchLook has started): meaning, text, and an optional undo, a
 * function to call from its Undo button.
 */
export function lookToast(meaning, text, { undo } = {}) {
  showToast?.(meaning, text, undo);
}

/** Starts watching. app is the app's root element (the toasts and the banner go in it). */
export function watchLook(app) {
  theme.addUsabilityCheck(() => {
    for (const [selector, what] of [
      ['[data-part="app-header"]', "hid the header"],
      ['[data-part="page"]', "hid the page"],
      ['[data-part="tab-bar"]', "hid the tabs"],
      ['[data-part="settings-button"], [data-part="app-back"]', "hid the way into Settings"],
    ]) {
      const node = app.querySelector(selector);
      if (node && !visible(node)) return what;
    }
    if (contrast("--ink-1", "--canvas") < 1.5) return "made the text the same color as the page";
    return null;
  });

  const host = el("div", { class: "lx-toasts", "aria-live": "polite" });
  app.append(host);
  let timer = null;
  // undo: a recent look's id to restore, or a function to call.
  const show = (meaning, text, undo) => {
    clearTimeout(timer);
    const toast = ui.toast(meaning, text);
    if (undo) {
      toast.append(
        ui.button("Undo", {
          variant: "fade",
          size: "sm",
          onclick: async () => {
            dismiss();
            try {
              if (typeof undo === "function") await undo();
              else await theme.restoreLook(undo);
            } catch (error) {
              show("wrong", error.message);
            }
          },
        }),
      );
    }
    host.replaceChildren(toast);
    motion.appear(toast);
    timer = setTimeout(dismiss, TOAST_MS);
  };
  const dismiss = () => {
    clearTimeout(timer);
    const toast = host.firstChild;
    if (!toast) return;
    motion.leave(toast, { dx: 0, dy: 12 });
    toast.remove();
  };
  showToast = show;
  theme.onChange((_, change) => {
    if (change?.kind === "reverted") show("wrong", `That look ${change.reason}, so it was undone`);
    else if (change?.kind === "remote") {
      const who = change.label || "your AI";
      show("right", who === "another device" ? "Your look changed on another device" : `${who[0].toUpperCase()}${who.slice(1)} changed your look`, change.undo);
    } else if (change?.started) {
      // A change to a built-in theme started a theme of yours. Undo goes back to the built-in theme and drops it.
      const startedId = theme.themeInUse().id;
      show("right", `Saved as a new theme of yours, ${change.started}`, async () => {
        await theme.restoreLook(change.undo);
        if (theme.savedTheme(startedId)) await theme.deleteTheme(startedId);
      });
    } else if (SAID[change?.kind]) show("right", SAID[change.kind](change), change.undo);
  });

  startLookSync({ aiConnected, onAiChange: onLayoutChange });

  if (theme.SAFE_MODE) {
    const leave = new URL(location.href);
    leave.searchParams.delete("safe");
    app.prepend(
      el(
        "div",
        { class: "lx-safe-banner", role: "status" },
        ui.feedback("slipping", "Safe mode", "Your colors, CSS and images are off on this page, so a look that broke the app can be fixed. Change them in Settings → Appearance, or start over there."),
        el("div", { class: "ds-states" }, el("a", { part: "button", variant: "gray", "data-size": "sm", href: "#settings/appearance" }, "Appearance"), el("a", { part: "button", variant: "white", "data-size": "sm", href: leave.pathname + leave.hash }, "Leave safe mode")),
      ),
    );
  }
}
