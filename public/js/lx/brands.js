// The marks of the services you can sign in with, and the sign-in button (part sign-in-button) as markup, so the
// server's pages (src/pages.ts) and the app (ui.js) draw the same button. Each mark is its owner's, used as their
// guidelines say: Google's "G" in its own colors, never changed (public/icons/google-g.png, from Google's sign-in
// branding assets), GitHub's mark (Primer Octicons' mark-github, MIT) drawn in the ink color, and Apple's logo (Simple Icons'
// apple, CC0) in the button's own ink, as Apple's Sign in with Apple guidelines show it.

import { iconMarkup } from "./icons.js";

const GITHUB_PATH =
  "M12.5.75C6.146.75 1 5.896 1 12.25c0 5.089 3.292 9.387 7.863 10.91.575.101.79-.244.79-.546 0-.273-.014-1.178-.014-2.142-2.889.532-3.636-.704-3.866-1.35-.13-.331-.69-1.352-1.18-1.625-.402-.216-.977-.748-.014-.762.906-.014 1.553.834 1.769 1.179 1.035 1.74 2.688 1.25 3.349.948.1-.747.402-1.25.733-1.538-2.559-.287-5.232-1.279-5.232-5.678 0-1.25.445-2.285 1.178-3.09-.115-.288-.517-1.467.115-3.048 0 0 .963-.302 3.163 1.179.92-.259 1.897-.388 2.875-.388.977 0 1.955.13 2.875.388 2.2-1.495 3.162-1.179 3.162-1.179.633 1.581.23 2.76.115 3.048.733.805 1.179 1.825 1.179 3.09 0 4.413-2.688 5.39-5.247 5.678.417.36.776 1.05.776 2.128 0 1.538-.014 2.774-.014 3.162 0 .302.216.662.79.547C20.709 21.637 24 17.324 24 12.25 24 5.896 18.854.75 12.5.75Z";

const APPLE_PATH =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";

/** A way to sign in: its name and its mark (markup, fixed strings only). */
export const SIGN_IN_WAYS = {
  google: { name: "Google", mark: '<img class="lx-brand-mark" src="/icons/google-g.png" alt="" width="20" height="20">' },
  github: {
    name: "GitHub",
    mark: `<svg class="lx-brand-mark" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${GITHUB_PATH}"/></svg>`,
  },
  apple: {
    name: "Apple",
    mark: `<svg class="lx-brand-mark" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${APPLE_PATH}"/></svg>`,
  },
  passkey: { name: "a passkey", mark: iconMarkup("key") },
};

const escapeText = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/**
 * A sign-in button as markup: way is google, github, apple or passkey; label defaults to "Continue with <name>". attrs are
 * extra attributes (name → value, escaped). Google's follows its guidelines (components.css): its G, its colors.
 * @param {"google" | "github" | "apple" | "passkey"} way
 * @param {{ label?: string, type?: string, attrs?: Record<string, string> }} [options]
 */
export function signInButtonMarkup(way, { label, type = "submit", attrs = {} } = {}) {
  const info = SIGN_IN_WAYS[way];
  const extra = Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeText(value)}"`)
    .join("");
  return `<button data-part="sign-in-button" data-variant="${way}" type="${type}"${extra}><span class="lx-sign-in-mark">${info.mark}</span><span class="lx-sign-in-label">${escapeText(label ?? `Continue with ${info.name}`)}</span></button>`;
}
