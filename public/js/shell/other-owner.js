// A device whose progress belongs to another account than the one signed in (sync.js ownedByAnother): a shared computer, a second account.
// Nothing merges and nothing syncs while that's so, either way. The app says so once per visit, plainly, with the way through: Use my
// progress on this device, which clears what this device holds and brings the signed-in account's own copy in its place. When some of
// what's here was never saved to its own account (studied since the device last synced with it), it says that first and asks again.
// Nothing of the other person's is ever uploaded, and nothing is deleted from either account's copy on the server.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { deviceOwner, ownThisDevice, ownedByAnother } from "../sync.js";
import { allEvidence } from "../study/progress.js";

const SAID = "lx.other-owner.said";

/**
 * What this device holds that lives nowhere else: { studied, texts, packs }. studied: an answer recorded after the device last synced clean
 * with its owner's account (or it never did). texts and packs: how many of the owner's own (texts added here, packs made or copied) were
 * added or changed after the device last synced clean with a storage of theirs, which is all of them when none ever was.
 */
export async function onlyHere() {
  const owner = deviceOwner();
  const rows = allEvidence();
  const last = rows.reduce((latest, row) => Math.max(latest, row.at ?? 0), 0);
  const since = (at) => !owner?.ownAt || (at ?? 0) > owner.ownAt;
  const [texts, packs] = await Promise.all([
    import("../read/store.js").then(async (m) => (await m.listBooks()).filter((book) => ["upload", "paste"].includes(book.source?.kind) && since(book.addedAt)).length).catch(() => 0),
    import("../study/packs.js").then((m) => m.yourPacks().filter((record) => since(record.changedAt ?? record.addedAt)).length).catch(() => 0),
  ]);
  return { studied: rows.length > 0 && (!owner?.syncedAt || last > owner.syncedAt), texts, packs };
}

/** That, in a few words ("some of what was studied here, 2 texts and a pack"), or "" when everything here is somewhere else too. */
export function onlyHereWords({ studied, texts, packs }) {
  const parts = [studied ? "some of what was studied here" : null, texts ? (texts === 1 ? "a text" : `${texts} texts`) : null, packs ? (packs === 1 ? "a pack" : `${packs} packs`) : null].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}

/** Opens the sheet (once per visit unless `again`). Returns it, or null when there's nothing to say. */
export function offerOwnProgress({ again = false } = {}) {
  if (!ownedByAnother()) return null;
  try {
    if (!again && sessionStorage.getItem(SAID)) return null;
    sessionStorage.setItem(SAID, "1");
  } catch {}
  const sheet = ui.sheetLayer({ label: "This device has someone else's progress" });
  const body = el("div", { class: "lx-stack", "data-other-owner": "" });
  const first = () => {
    const use = ui.button("Use my progress on this device", {
      variant: "go",
      block: true,
      onclick: async () => {
        const only = onlyHereWords(await onlyHere());
        if (only) warn(only);
        else replace(use);
      },
    });
    body.replaceChildren(
      el("h2", { class: "lx-sheet-title" }, "This device has someone else's progress"),
      el("p", {}, "What's been studied here belongs to another account. Nothing of theirs is added to yours, and nothing of yours is brought here, while it stays."),
      el("p", { class: "lx-small lx-muted" }, "Use my progress on this device clears what this device holds (their progress, books, texts and packs here) and brings yours in its place. Their account keeps its own copy."),
      use,
      ui.button("Not now", { variant: "gray", block: true, onclick: () => sheet.lxClose() }),
    );
  };
  // Some of it is only here: said before anything goes, and asked again.
  const warn = (only) => {
    const go = ui.button("Clear it and use mine", { variant: "gray", block: true, onclick: () => replace(go) });
    body.replaceChildren(
      el("h2", { class: "lx-sheet-title" }, "Some of it exists only on this device"),
      el("p", { "data-other-owner-warning": "" }, `On this device and nowhere else: ${only}. Clearing this device loses it for good.`),
      ui.button("Keep it", { variant: "go", block: true, onclick: () => sheet.lxClose() }),
      go,
    );
  };
  const replace = async (button) => {
    button.disabled = true;
    try {
      const { clearThisDevice } = await import("./settings.js");
      await clearThisDevice();
      // This device is the signed-in account's from here: a start with nothing on it brings its own copy (shell/main.js bringProgress).
      ownThisDevice();
      location.reload();
    } catch (error) {
      button.disabled = false;
      body.append(el("p", { class: "lx-small", role: "alert" }, error?.message ?? String(error)));
    }
  };
  first();
  sheet.lxBody.append(body);
  sheet.lxOpen();
  return sheet;
}
