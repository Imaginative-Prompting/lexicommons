// The sign-in pages' passkeys (src/pages.ts: /login and the create step /login/new). Google and GitHub are plain form
// posts to /login/<provider> and need nothing here. On /login: sign in with a passkey, or create an account with one.
// On the create step: sign in with a passkey, then the Google or GitHub account waiting there joins that account
// (/login/attach). Either way it goes on to ?next= (an AI app's consent screen, or the app).
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "/vendor/simplewebauthn/index.js";
import { fetchRetrying } from "./lx/retry.js";
import { refusalWords, SOMETHING_WRONG } from "./refusal-words.js";

const root = document.getElementById("auth");
const next = root.dataset.next || "/app/";
const attaching = root.dataset.attach;
const errorBox = document.getElementById("auth-error");
const register = document.getElementById("register");

// The site's own pages follow the phone's light or dark (src/pages.ts lxLayout): no saved look, so no look's images either.

// The page's ways sit at the screen's foot on a phone (signin.css: in a thumb's reach), the page centered on a wide screen. Something growing
// there (the create form opening, a message) would push what's above it up the screen in one frame. Before it grows, the free space is
// kept as it is (the ways' margin, the page's top), so it grows downward; what it opened then scrolls into view.
const page = document.querySelector(".lx-signin");
function growDown(change, show = null) {
  const styleOf = getComputedStyle(page);
  if (styleOf.justifyContent === "center") {
    const top = page.firstElementChild.getBoundingClientRect().top - page.getBoundingClientRect().top;
    page.style.justifyContent = "flex-start";
    page.style.paddingBlockStart = `${top}px`;
  }
  root.style.marginBlockStart = getComputedStyle(root).marginBlockStart;
  change();
  if (show) requestAnimationFrame(() => show.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
}

function showError(message) {
  errorBox.querySelector('[data-part="feedback-title"]').textContent = message;
  growDown(() => (errorBox.hidden = false), errorBox);
}

// The fold that opens the create form (signing in first): opened here, growing downward, its name field then in view.
const fold = document.getElementById("new");
fold?.querySelector("summary")?.addEventListener("click", (event) => {
  event.preventDefault();
  const opening = !fold.open;
  growDown(() => (fold.open = opening), opening ? register : null);
});

// The server's overload is tried again only where it says nothing was applied (lx/retry.js): a passkey's options or answer, sent again.
async function post(path, body) {
  const response = await fetchRetrying(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(refusalWords(data));
  return data;
}

function friendly(error, { signingIn }) {
  // The browser's own cancel and timeout errors read badly; say what happened instead.
  if (error?.name === "NotAllowedError") {
    return signingIn && !attaching && root.dataset.mode !== "new"
      ? "No passkey was used. If you're new here, create an account below."
      : "The passkey prompt was closed before it finished.";
  }
  if (error?.name === "InvalidStateError") return "This device already has a passkey for this account.";
  if (signingIn && /isn't registered/.test(error?.message ?? "")) {
    return attaching ? "That passkey isn't for an account here." : root.dataset.mode === "new" ? "That passkey isn't for an account here (was it deleted?). Create a new one above." : "That passkey isn't for an account here (was it deleted?). Create a new one below.";
  }
  return error?.message || SOMETHING_WRONG;
}

const passkeyButton = document.getElementById("signin");
if (!browserSupportsWebAuthn()) {
  passkeyButton.disabled = true;
  register?.querySelector('button[type="submit"]')?.setAttribute("disabled", "");
  showError("This browser can't use passkeys. Continue with Google or GitHub, or try an up-to-date Safari, Chrome or Firefox.");
}

passkeyButton.addEventListener("click", async () => {
  errorBox.hidden = true;
  try {
    const options = await post("/api/auth/login/options");
    const response = await startAuthentication({ optionsJSON: options });
    await post("/api/auth/login/verify", response);
    if (attaching) {
      const { next: after } = await post("/login/attach");
      location.assign(after || next);
    } else {
      location.assign(next);
    }
  } catch (error) {
    showError(friendly(error, { signingIn: true }));
  }
});

register?.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const name = new FormData(register).get("name");
  try {
    const options = await post("/api/auth/register/options", { name });
    const response = await startRegistration({ optionsJSON: options });
    await post("/api/auth/register/verify", response);
    location.assign(next);
  } catch (error) {
    showError(friendly(error, { signingIn: false }));
  }
});
