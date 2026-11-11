// Settings → Admin → Feature flags (#settings/admin/flags), an admin's: what isn't on for everyone yet, previewed on this device alone. One row
// per flag (the server's list, /api/admin/flags: src/flags.ts), its switch turning the preview on or off for this device's requests only (the
// server keeps the device's previews in its own cookie; nobody else changes, and nothing for everyone is set from the app). Under each, quietly,
// what everyone has. A preview that can't work here yet says why, and its switch can't be pressed. After a change /api/me is read again, so
// what this device shows (sharing, the plan, a key of your own) follows at once, and with "See the app as a learner" on it shows what a learner
// would see were it on for everyone.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t } from "../lx/i18n.js";
import { api, whoAmI } from "./api.js";
import { message } from "./settings.js";
import { sharingChanged } from "./sharing.js";

const put = (path, body) => api(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

// What everyone has, as words: a switch's on or off, a choice's value where the page knows it, else as the server names it.
const valueWords = (flag) => {
  if (flag.kind === "switch") return flag.value ? t("settings.flags.on") : t("settings.flags.off");
  return { admins: t("settings.flags.admins"), everyone: t("settings.flags.everyone") }[flag.value] ?? String(flag.value);
};

export function featureFlagsPage(page) {
  const body = el("div", { class: "lx-stack" });
  const msg = message();
  page.replaceChildren(ui.pageTitle(t("settings.flags.title"), t("settings.flags.sub")), body, msg);
  let stale = false;
  // Its rows' place held while the list comes: four rows, as the server lists them.
  body.replaceChildren(ui.held({ height: 4 * 76 + 16, radius: 16 }, "settings.flags"));
  let shown = [];
  const draw = (flags) => {
    shown = flags;
    const rows = flags.map((flag) => flagRow(flag, { msg, changed: (next) => draw(shown.map((one) => (one.name === next.name ? next : one))) }));
    const anyOn = flags.some((flag) => flag.preview?.on);
    const list = el(
      "div",
      { class: "lx-stack" },
      el("section", { class: "lx-group lx-flags" }, el("ul", { part: "list" }, ...rows)),
      // Every preview off at once, when there's one on.
      ...(anyOn ? [ui.button(t("settings.flags.allOff"), { variant: "fade", block: true, onclick: () => allOff() })] : []),
    );
    const held = body.querySelector(':scope > [data-part="skeleton"]');
    if (held) ui.arrive(held, list);
    else body.replaceChildren(list);
  };
  const allOff = async () => {
    try {
      const { flags } = await api("/api/admin/previews", { method: "DELETE" });
      draw(flags ?? []);
      msg.say(t("settings.flags.allOffSaid"), "right");
      await whoAmI().catch(() => {});
      sharingChanged();
    } catch (error) {
      msg.say(error.message, "wrong");
    }
  };
  // Only an admin's: anyone else who lands here is told so, and nothing of the flags is asked for or shown.
  const loaded = whoAmI()
    .then((me) => {
      if (stale) return;
      if (!me?.roles?.includes("admin")) return void body.replaceChildren(el("p", { class: "lx-muted" }, t("settings.flags.adminOnly")));
      return api("/api/admin/flags").then(({ flags }) => !stale && draw(flags ?? []));
    })
    .catch((error) => !stale && body.replaceChildren(ui.loadFailed(error, () => featureFlagsPage(page))));
  return { title: t("settings.flags.title"), back: { href: "#settings/admin", label: t("settings.flags.back") }, ready: loaded, dispose: () => (stale = true) };
}

/** One flag: its preview on this device as a switch, what it shows, and quietly what everyone has (or why it can't be previewed yet). */
function flagRow(flag, { msg, changed }) {
  const can = flag.preview?.can === true;
  const state = can ? t("settings.flags.forEveryone", { value: valueWords(flag) }) : t("settings.flags.cantYet", { missing: flag.preview?.can?.missing ?? "" });
  const sub = el("span", {}, el("span", { class: "lx-flag-about" }, flag.about), el("span", { class: "lx-flag-state" }, state));
  let sending = false;
  const row = ui.switchRow({
    title: flag.title,
    sub,
    checked: Boolean(flag.preview?.on),
    onchange: async (on, input) => {
      if (sending) return void (input.checked = !on);
      sending = true;
      try {
        const { flag: next } = await put(`/api/admin/flags/${encodeURIComponent(flag.name)}/preview`, { on });
        changed(next);
        msg.say(t(on ? "settings.flags.previewOn" : "settings.flags.previewOff", { title: next.title }), "right");
        await whoAmI().catch(() => {});
        sharingChanged();
      } catch (error) {
        input.checked = !on;
        msg.say(error.message, "wrong");
      } finally {
        sending = false;
      }
    },
  });
  row.dataset.flag = flag.name;
  // One that can't be previewed here yet: its switch can't be pressed, and the line under it says why.
  if (!can) {
    row.querySelector("input").disabled = true;
    row.dataset.state = "not-ready";
  }
  return row;
}
