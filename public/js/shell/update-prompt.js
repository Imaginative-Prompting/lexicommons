// A new version while the app is open. The Home Screen app comes back from memory without loading anything, so a version deployed since
// stayed out until the app was closed and opened again, sometimes twice. Now:
// - When the app comes back into view (at most once a minute), the worker is asked to look for a new version (registration.update()).
// - sw.js installs a new one at once, waits for nothing and takes every page: a new worker taking over a page that already had one is a
//   new version, ready.
// - Then a quiet prompt over the tab bar, "A new version is ready", with Reload and Later. Never during a session or a practice in progress:
//   one that's up when a session or a practice starts goes until you leave it, then it's back. Never a reload by itself.
// - Reload is location.reload(): it keeps the history and each entry's place (history.state.lx.i), so the router carries on where it was
//   (shell/route.js; scripts/test-history.mjs). It marks itself first (lx/error-report.js markOwnReload), so the start after isn't
//   reported as the app starting again by itself. Later hides it for this start; the next start is the new version anyway.
import * as ui from "../lx/ui.js";
import { markOwnReload } from "../lx/error-report.js";
import * as motion from "../lx/motion.js";

const CHECK_EVERY = 60_000;

/** Whether something's in progress that a reload would cut short: a session, or a practice open past its list. */
export const busyRoute = (hash) => /^#study\/session/.test(hash) || /^#(study\/)?practice\/./.test(hash);

/** Starts watching for a new version, given the worker's registration (or its promise). */
export function watchForUpdates(registration) {
  const workers = navigator.serviceWorker;
  if (!workers) return;
  // A page with no worker yet is a first open: the worker taking it then is no new version, but every one after is (a page left open
  // from its first open was never offered one).
  let hadWorker = Boolean(workers.controller);
  let ready = false;
  let later = false;
  let prompt = null;
  let checked = 0;

  const show = () => {
    if (!ready || later || prompt || busyRoute(location.hash)) return;
    const host = document.querySelector(".lx-update") ?? document.body.appendChild(ui.el("div", { class: "lx-toasts lx-update", "aria-live": "polite" }));
    prompt = ui.toast("info", "A new version is ready");
    prompt.setAttribute("data-update", "");
    prompt.append(
      ui.button("Reload", { variant: "white", size: "sm", onclick: () => (markOwnReload(), location.reload()) }),
      ui.button("Later", {
        variant: "fade",
        size: "sm",
        onclick: () => {
          later = true;
          hide();
        },
      }),
    );
    host.replaceChildren(prompt);
    motion.appear(prompt);
  };
  const hide = () => {
    if (!prompt) return;
    const leaving = prompt;
    prompt = null;
    motion.leave(leaving, { dx: 0, dy: 12 });
    leaving.remove();
  };
  // Every move between pages: into a session or a practice in progress, it goes and waits (it stayed over a whole session and its
  // summary once, v99 on Android); out of one, or anywhere else, it's shown if it's waiting.
  const place = () => (busyRoute(location.hash) ? hide() : show());
  addEventListener("hashchange", place);
  addEventListener("lx-route-replaced", place);

  workers.addEventListener("controllerchange", () => {
    if (!hadWorker) {
      hadWorker = true;
      return;
    }
    ready = true;
    document.documentElement.setAttribute("data-update", "ready");
    show();
  });

  // Back into view: look for a new version (not more than once a minute).
  const look = () => {
    if (document.visibilityState !== "visible" || Date.now() - checked < CHECK_EVERY) return;
    checked = Date.now();
    Promise.resolve(registration)
      .then((reg) => reg?.update())
      .catch(() => {});
  };
  document.addEventListener("visibilitychange", look);
  addEventListener("pageshow", (event) => event.persisted && look());
}
