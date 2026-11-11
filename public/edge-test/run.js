// A temporary page (public/edge-test/, an admin's row in Settings → Admin): what an iPhone does with a swipe from the screen's left edge, in the
// Home Screen app and in a Safari tab, and whether a page can take that edge for its own. Five tries, one at a time, each with one way of taking
// the edge (or none): nothing; preventDefault on a touch that starts within 24 px of the edge; touch-action: none; overscroll-behavior: none; all
// of them. Each try puts two entries in this page's history, so a back stays on this page, and watches what happens: a back (popstate), the
// touch the page was given (where it started, how far it moved, whether it was taken away: touchcancel). Then it asks to be sure. Each answer goes
// to /api/notes on this account as "edge-test <run> <try> back=… said=… …", so whoever reads the notes has the results. It comes out once it
// has answered.

const RUN = Math.random().toString(36).slice(2, 8);
const EDGE = 24;
const TRIES = [
  { id: "none", says: "nothing done" },
  { id: "edge-prevent", says: "a touch at the edge stopped (preventDefault)" },
  { id: "touch-action", says: "touch-action: none" },
  { id: "overscroll", says: "overscroll-behavior: none" },
  { id: "all", says: "all of them at once" },
];
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ios = (navigator.userAgent.match(/OS (\d+)_(\d+)/) ?? []).slice(1).join(".") || "?";
const $ = (id) => document.getElementById(id);

$("where").textContent = `${standalone ? "You're in the app on your Home Screen" : "You're in a browser tab"} (iOS ${ios}). Five short tries: each asks you to swipe from the very left edge of the screen to the right, and then whether the page went back.`;

let sending = Promise.resolve();
function send(text) {
  sending = sending.then(async () => {
    try {
      const response = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      $("sent").textContent = response.ok ? "Saved." : `Not saved (${response.status}). Are you signed in?`;
    } catch {
      $("sent").textContent = "Not saved: no connection.";
    }
  });
}

function buttons(list) {
  $("buttons").replaceChildren(
    ...list.map(([label, onpick, picked]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (picked) b.setAttribute("data-picked", "");
      b.addEventListener("click", onpick, { once: true });
      return b;
    }),
  );
}

/** One try: the edge taken this way, a swipe watched, then asked. Resolves when answered. */
function attempt(t, n) {
  return new Promise((resolve) => {
    const html = document.documentElement;
    html.setAttribute("data-take", t.id);
    const seen = { back: false, startX: null, moved: 0, cancel: false, ended: false };
    const stopEdge = (event) => {
      if (event.touches[0] && event.touches[0].clientX < EDGE) event.preventDefault();
    };
    if (t.id === "edge-prevent" || t.id === "all") document.addEventListener("touchstart", stopEdge, { passive: false, capture: true });
    const onStart = (event) => {
      if (seen.startX === null) seen.startX = Math.round(event.touches[0]?.clientX ?? -1);
    };
    const onMove = (event) => {
      const x = event.touches[0]?.clientX;
      if (x !== undefined && seen.startX !== null) seen.moved = Math.max(seen.moved, Math.round(x - seen.startX));
    };
    const onCancel = () => (seen.cancel = true);
    const onEnd = () => {
      seen.ended = true;
      setTimeout(ask, 900);
    };
    const onPop = () => {
      seen.back = true;
      setTimeout(ask, 400);
    };
    addEventListener("touchstart", onStart, { capture: true, passive: true });
    addEventListener("touchmove", onMove, { capture: true, passive: true });
    addEventListener("touchcancel", onCancel, { capture: true });
    addEventListener("touchend", onEnd, { capture: true });
    addEventListener("popstate", onPop);
    // Two entries of this page's own to go back through.
    history.pushState({ edge: t.id, at: 1 }, "", `#${t.id}-1`);
    history.pushState({ edge: t.id, at: 2 }, "", `#${t.id}-2`);
    $("count").textContent = `Try ${n} of ${TRIES.length}`;
    $("say").textContent = "Swipe from the very left edge of the screen to the right, now.";
    $("buttons").replaceChildren();
    const timer = setTimeout(ask, 12_000);
    let asked = false;
    function ask() {
      if (asked) return;
      asked = true;
      clearTimeout(timer);
      removeEventListener("touchstart", onStart, { capture: true });
      removeEventListener("touchmove", onMove, { capture: true });
      removeEventListener("touchcancel", onCancel, { capture: true });
      removeEventListener("touchend", onEnd, { capture: true });
      removeEventListener("popstate", onPop);
      document.removeEventListener("touchstart", stopEdge, { capture: true });
      html.removeAttribute("data-take");
      const looked = seen.back ? "went back" : seen.startX === null ? "saw no swipe" : "stayed";
      $("say").textContent = `It looks like the page ${looked === "saw no swipe" ? "didn't see a swipe" : looked}. Did the page go back?`;
      const answer = (said) => () => {
        send(`edge-test ${RUN} ${t.id} back=${seen.back ? "yes" : "no"} said=${said} x=${seen.startX ?? "-"} moved=${seen.moved} cancel=${seen.cancel ? "yes" : "no"} standalone=${standalone} ios=${ios}`);
        resolve();
      };
      buttons([
        ["Yes, it went back", answer("yes"), seen.back],
        ["No, it stayed", answer("no"), !seen.back && seen.startX !== null],
      ]);
    }
  });
}

buttons([
  [
    "Start",
    async () => {
      for (const [i, t] of TRIES.entries()) await attempt(t, i + 1);
      $("count").textContent = "";
      $("say").textContent = standalone
        ? "Done, thank you. Now the same in Safari: open lexicommons.com/edge-test/ in a Safari tab."
        : "Done, thank you. If you haven't yet, do the same in the app on your Home Screen: Settings, Admin, Edge swipe test.";
      $("buttons").replaceChildren();
    },
  ],
]);
