// Getting back in with the account's email (src/pages.ts recoverPage; src/account-email.ts): the address, then the 6-digit code sent to it,
// typed here (no link is ever sent: a Home Screen app keeps its own cookies, apart from the browser a link would open in), which opens a
// session; then a passkey for this device, so next time it signs in by itself, or Not now. Either way on to ?next=.
import { startRegistration, browserSupportsWebAuthn } from "/vendor/simplewebauthn/index.js";
import { refusalWords, SOMETHING_WRONG } from "./refusal-words.js";

const root = document.getElementById("recover");
const next = root.dataset.next || "/app/";
const errorBox = document.getElementById("auth-error");
const emailForm = document.getElementById("recover-email");
const codeForm = document.getElementById("recover-code");
const passkeyStep = document.getElementById("recover-passkey");
let codeId = null;

// The site's own pages follow the phone's light or dark (src/pages.ts lxLayout): no saved look, so no look's images either.

function showError(message) {
  errorBox.querySelector('[data-part="feedback-title"]').textContent = message;
  errorBox.hidden = false;
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(refusalWords(data));
  return data;
}

// A press while a step is on its way does nothing more (the button stays as it is, never disabled).
let busy = false;
const step = (fn) => async (event) => {
  event?.preventDefault();
  if (busy) return;
  busy = true;
  errorBox.hidden = true;
  try {
    await fn();
  } catch (error) {
    showError(error?.message || SOMETHING_WRONG);
  } finally {
    busy = false;
  }
};

emailForm.addEventListener(
  "submit",
  step(async () => {
    const { id } = await post("/api/recover", { email: emailForm.elements.email.value });
    codeId = id;
    emailForm.hidden = true;
    codeForm.hidden = false;
    codeForm.elements.code.value = "";
    codeForm.elements.code.focus({ preventScroll: true });
  }),
);

codeForm.addEventListener(
  "submit",
  step(async () => {
    await post("/api/recover/confirm", { id: codeId, code: codeForm.elements.code.value });
    codeForm.hidden = true;
    passkeyStep.hidden = false;
    if (!browserSupportsWebAuthn()) document.getElementById("recover-add").hidden = true;
  }),
);

document.getElementById("recover-again").addEventListener("click", () => {
  codeId = null;
  errorBox.hidden = true;
  codeForm.hidden = true;
  emailForm.hidden = false;
  emailForm.elements.email.focus({ preventScroll: true });
});

document.getElementById("recover-add").addEventListener(
  "click",
  step(async () => {
    try {
      const options = await post("/api/auth/passkeys/options");
      const response = await startRegistration({ optionsJSON: options });
      await post("/api/auth/passkeys/verify", response);
    } catch (error) {
      if (error?.name === "NotAllowedError") throw new Error("The passkey prompt was closed before it finished. Try again, or choose Not now.");
      if (error?.name === "InvalidStateError") throw new Error("This device already has a passkey for this account.");
      throw error;
    }
    location.assign(next);
  }),
);
