// Settings → Account → Email (src/account-email.ts): an email on the account, for getting back in if a passkey is lost and for receipts (only
// where this site offers the plan: /api/me's features.plan, as this device last heard it), and
// nothing else. Adding or changing it sends a 6-digit code to it, typed here; it's kept only once the code comes back. Shown only where this
// site sends email (/api/me's email.offered). settings.js draws emailRows on the Account page and opens emailPage at #settings/account/email.
import { wordsRow } from "./settings.js";
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { statusLine } from "../lx/appearance.js";
import { api, del, keptMe, post } from "./api.js";

// Receipts are named only where there can be any: on a site that offers the plan.
const receipts = () => Boolean(keptMe()?.features?.plan);
const about = () =>
  `Only for getting back into your account if you lose your passkey${receipts() ? ", and for receipts" : ""}. It's never a way to sign in by itself, it's never shown to anyone, and nothing else is ever sent to it.`;

// The address as this page last set it (added or removed here), so the Account page names it at once, never the one /api/me had at the app's
// start for a moment first.
let setHere = null;

/** The Account page's row, as a list to spread in: none where this site sends no email. */
export function emailRows(me) {
  if (!me?.email?.offered) return [];
  const email = setHere ? setHere.email : me.email.email;
  const row = ui.listRow({ title: "Email", value: email ?? "None", href: "#settings/account/email" });
  // What's on the account now: changed on another device since, too.
  api("/api/account/email")
    .then((now) => {
      const value = row.querySelector(".lx-row-value");
      if (value && now?.offered) value.textContent = now.email ?? "None";
    })
    .catch(() => {});
  return [ui.group(null, [row])];
}

/** The page: what the address is for, the one on the account (Change, Remove), and adding one by its code. */
export function emailPage(page) {
  const back = { href: "#settings/account", label: "Account" };
  const status = statusLine();
  const current = el("div");
  const form = el("form", { class: "lx-stack lx-email-form", novalidate: "" });
  let codeId = null;
  let busy = false;

  const field = (label, input) => el("label", { part: "field" }, el("span", {}, label), input);
  const address = el("input", { part: "text-field", type: "email", name: "email", maxlength: 254, autocomplete: "email", inputmode: "email", "aria-label": "Email" });
  const code = el("input", { part: "text-field", name: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 7, "aria-label": "The code" });

  // A press while a step is on its way does nothing more (the button stays as it is, never disabled).
  const once = (fn) => async (event) => {
    event?.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (error) {
      status.say(error?.message || "Something went wrong. Try again.", "wrong");
    } finally {
      busy = false;
    }
  };

  const askForAddress = (has) => {
    codeId = null;
    address.value = "";
    form.replaceChildren(
      field(has ? "A new email" : "Your email", address),
      ui.button("Send a code", { variant: "go", size: "lg", block: true, type: "submit" }),
    );
    form.onsubmit = once(async () => {
      const { id, sentTo } = await post("/api/account/email", { email: address.value });
      codeId = id;
      askForCode(sentTo);
    });
  };
  const askForCode = (sentTo) => {
    code.value = "";
    form.replaceChildren(
      el("p", { class: "lx-small lx-muted" }, `A 6-digit code is on its way to ${sentTo}. It works for 15 minutes.`),
      field("The code", code),
      ui.button("Confirm", { variant: "go", size: "lg", block: true, type: "submit" }),
      ui.button("Use another email", { variant: "fade", size: "sm", onclick: () => (status.say(""), askForAddress(true)) }),
    );
    form.onsubmit = once(async () => {
      const { email } = await post("/api/account/email/confirm", { id: codeId, code: code.value });
      setHere = { email };
      status.say(`${email} is on your account`, "right");
      draw({ email });
    });
    code.focus({ preventScroll: true });
  };

  const draw = ({ email }) => {
    if (email) {
      let sure = false;
      const remove = ui.button("Remove", {
        variant: "fade",
        size: "sm",
        onclick: once(async () => {
          // Asked once on the button itself: no dialog.
          if (!sure) {
            sure = true;
            remove.replaceChildren("Remove it: you can't get back in by email then");
            return;
          }
          await del("/api/account/email");
          setHere = { email: null };
          status.say("Email removed", "right");
          draw({ email: null });
        }),
      });
      current.replaceChildren(ui.group(null, [ui.listRow({ title: email, trailing: remove })]));
    } else current.replaceChildren();
    askForAddress(Boolean(email));
  };

  // What it's for in a line; the rest of what it promises a press away.
  page.replaceChildren(ui.pageTitle("Email", `For getting back in if you lose your passkey${receipts() ? ", and for receipts" : ""}.`), current, form, status, el("ul", { part: "list" }, wordsRow("What it's for", about())));
  api("/api/account/email")
    .then((now) => {
      if (!now?.offered) {
        current.replaceChildren(el("p", { class: "lx-muted" }, "This site doesn't send email."));
        form.replaceChildren();
        return;
      }
      draw(now);
    })
    .catch((error) => status.say(error.message, "wrong"));
  return { title: "Email", back };
}
