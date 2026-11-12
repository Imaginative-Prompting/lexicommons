// Server-rendered pages: the site gate, sign-in and its create step, the OAuth consent screen, and messages. Everything
// an AI client, a provider or a browser supplies is escaped; error and notice words come from here, by code, never from
// a URL. Sign-in, consent and messages are built on the design system (public/css/lx/, the sign-in-button part from
// public/js/lx/brands.js), so they follow the device's saved look; the gate keeps the plain /css/app.css, the only
// stylesheet open past it. The installable app itself is static (public/app/).

import { startupLinks } from "./startup-images";
import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";
import { SIGN_IN_WAYS, signInButtonMarkup } from "../public/js/lx/brands.js";
import { iconMarkup } from "../public/js/lx/icons.js";
import { BUG_LIMITS } from "../public/js/lx/bug-rules.js";
import type { Provider } from "./signin";
import { DEFAULT_SCOPES } from "./env";
import { escapeHtml } from "./util";
import { SIGNUPS_PAUSED, SIGNUPS_PAUSED_HAVE } from "./signups";
import settingsWords from "../public/js/i18n/en/settings.js";
import coreWords from "../public/js/i18n/en/core.js";

/** A Settings entry's English (public/js/i18n/en/settings.js): the sign-in pages are in English, and their words are the app's own. */
const say = (key: string) => ({ ...(settingsWords as Record<string, string[]>), ...(coreWords as Record<string, string[]>) })[key]![0]!;

const SCOPE_WORDS: Record<string, string> = {
  "learn:read": "See your study progress and what you've made",
  "learn:write": "Add notes, lessons and audio to your library",
};

const PROVIDER_NAMES: Record<Provider, string> = { google: "Google", github: "GitHub", apple: "Apple" };

// Bump with any change to the files these pages load (they're fetched network-first; the query only busts caches).
const V = "auth5";

function layout(title: string, body: string, scripts: string[] = []): string {
  const scriptTags = scripts.map((src) => `<script type="module" src="${src}"></script>`).join("");
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
<title>${escapeHtml(title)}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${startupLinks()}
<link rel="stylesheet" href="/css/app.css">
</head>
<body>
<main class="narrow">${body}</main>
${scriptTags}
</body>
</html>`;
}

/**
 * A page on the design system, the site's own (signing in, creating an account, connecting an app, a message): it follows the phone's light
 * or dark (Match device, data-theme="auto") as the public page does, and never a look saved on this device (theme-boot.js skips a page
 * marked data-site-look), so the step from the public page into it never changes the screen's colors. The app has its own look from /app/ on.
 */
function lxLayout(title: string, body: string, { scripts = [] as string[], mode = "", reportLink = true, signInLink = false } = {}): string {
  const scriptTags = scripts.map((src) => `<script type="module" src="${src}?v=${V}"></script>`).join("\n");
  return `<!doctype html>
<html lang="en" data-theme="auto" data-site-look>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#fdfdfc" media="(prefers-color-scheme: light)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<title>${escapeHtml(title)}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${startupLinks()}
<script src="/js/lx/theme-boot.js?v=${V}"></script>
<link rel="stylesheet" href="/css/lx/tokens.css?v=${V}">
<link rel="stylesheet" href="/css/lx/art.css?v=${V}">
<link rel="stylesheet" href="/css/lx/base.css?v=${V}">
<link rel="stylesheet" href="/css/lx/components.css?v=${V}">
<link rel="stylesheet" href="/css/lx/presets.css?v=${V}">
<link rel="stylesheet" href="/css/signin.css?v=${V}">
${scriptTags}
</head>
<body>
<main class="lx-signin"${mode ? ` data-mode="${mode}"` : ""}>
${BRAND}
<div class="lx-signin-card">
${body}
</div>
<footer class="lx-signin-foot lx-small">${signInLink ? `<a href="/login">${escapeHtml(say("settings.report.signInLink"))}</a>` : ""}<a href="/privacy">Privacy</a><a href="/terms">Terms</a>${reportLink ? `<a href="/report">${escapeHtml(say("settings.report.title"))}</a>` : ""}</footer>
</main>
</body>
</html>`;
}

// The Lexicommons mark: the ink drop, Lexicommons' character (public/icons/mark.svg, drawn from its rig), in the tile.
const MARK = `<img class="lx-signin-mark" src="/icons/mark.svg" alt="" aria-hidden="true">`;
const BRAND = `<a class="lx-signin-brand" href="/" aria-label="Lexicommons home">${MARK}<span>Lexicommons</span></a>`;

/** A notice and its sentence: right (a check), wrong (a cross), or info (no meaning color, an info mark). */
function notice(meaning: "right" | "wrong" | "info", text: string, { id, hidden = false }: { id?: string; hidden?: boolean } = {}): string {
  const role = meaning === "wrong" ? "alert" : "status";
  const icon = { right: "check", wrong: "cross", info: "info" }[meaning];
  const meaningAttr = meaning === "info" ? "" : ` data-meaning="${meaning}"`;
  return `<div data-part="feedback"${meaningAttr} role="${role}"${id ? ` id="${id}"` : ""}${hidden ? " hidden" : ""}>${iconMarkup(icon)}<span data-part="feedback-title">${escapeHtml(text)}</span></div>`;
}

/** New accounts paused (signups.ts): the words, as a calm notice where the create form would be. */
const pausedNotice = () => notice("info", `${SIGNUPS_PAUSED} ${SIGNUPS_PAUSED_HAVE}`, { id: "signups-paused" });

/** The words for a sign-in error code (signin.ts sends these), or null for a code it doesn't know. */
export function signInErrorText(code: string | null, provider?: Provider): string | null {
  const name = provider ? PROVIDER_NAMES[provider] : null;
  switch (code) {
    case "cancelled":
      return name ? `You canceled signing in with ${name}.` : "Signing in was canceled.";
    case "expired":
      return "That sign-in took too long, or was started in another tab. Try again.";
    case "provider":
      return `${name ?? "The other site"} didn't answer as expected. Try again, or use another way to sign in.`;
    case "unavailable":
      return `Signing in with ${name ?? "that"} isn't available right now. Use another way.`;
    case "busy":
      return "Too many attempts. Wait a minute, then try again.";
    case "paused":
      return SIGNUPS_PAUSED;
    case "taken":
      return name
        ? `That ${name} account already signs in to another Lexicommons account. Continue with ${name} to use that one.`
        : "That account already signs in to another Lexicommons account.";
    case "signed-out":
      return "You were signed out. Sign in, then try again.";
    case "name":
      return "Pick a name between 1 and 40 characters.";
    case "unknown":
      return `No account uses that ${name ?? "one"} either. Create one here, and you can sign in with either.`;
    default:
      return null;
  }
}

const AGREE = `<p class="lx-small lx-muted">Making an account means you agree to the <a href="/terms">terms</a> and the <a href="/privacy">privacy policy</a>.</p>`;

const hiddenNext = (next: string) => `<input type="hidden" name="next" value="${escapeHtml(next)}">`;

function providerForm(provider: Provider, next: string, intent: "signin" | "attach"): string {
  return `<form method="post" action="/login/${provider}">${hiddenNext(next)}<input type="hidden" name="intent" value="${intent}">${signInButtonMarkup(provider)}</form>`;
}

export type LoginOptions = {
  deleted?: boolean;
  signedOut?: boolean;
  error?: string | null;
  provider?: Provider;
  /** The AI app asking to connect, when next is its /authorize. */
  connecting?: string | null;
  providers?: Record<Provider, boolean>;
  /** Getting back in with the account's email (account-email.ts): offered where this site sends email. */
  recovery?: boolean;
  /** Someone new (the public page's Start learning, /login?new=1): creating an account first, open from the first paint, and signing in
   *  plain beneath it. Without it, signing in comes first and creating an account is the fold under it. */
  newcomer?: boolean;
  /** Whether a learner can share (COMMUNITY_SHARING "everyone"): the name's line says where it shows. */
  sharingOpen?: boolean;
  /** New accounts paused (signups.ts): the words where the create form would be, signing in as ever. */
  signupsPaused?: boolean;
};

/** What a name is for, as it's true now: on what you share once learners can share; until then, only yours. */
export const nameLine = (sharingOpen: boolean): string => (sharingOpen ? "Shown on anything you share." : "Only you see it, on your account.");

/** On a computer, a quiet line that Lexicommons is made for phones first, and the way onto one, its address and a code for the phone's camera
 *  (public/icons/site/qr-lexicommons.svg: https://lexicommons.com). Right after the ways in: a wide window shows it in a column beside them, a
 *  narrower one at the card's end (signin.css). Drawn hidden; login.js shows it only where install-guide.js's detect says it's neither a phone
 *  nor a tablet (nor an app's own browser), so a phone never shows it, and never fetches the code (lazy). */
const computerNote = () => `<aside class="lx-signin-computer" id="on-a-computer" hidden>
<img src="/icons/site/qr-lexicommons.svg" width="99" height="99" alt="${escapeHtml(say("core.computer.qr"))}" loading="lazy" decoding="async">
<p class="lx-small">${escapeHtml(say("core.computer.note"))} ${escapeHtml(say("core.computer.phone"))}</p>
</aside>`;

export function loginPage(next: string, options: LoginOptions = {}): string {
  const { deleted = false, signedOut = false, connecting = null, providers = { google: true, github: true, apple: false } } = options;
  // Paused, someone new gets the sign-in page with the words at its top: there's no account to make.
  const paused = Boolean(options.signupsPaused);
  const newcomer = Boolean(options.newcomer) && !connecting && !paused;
  const named = nameLine(Boolean(options.sharingOpen));
  const error = signInErrorText(options.error ?? null, options.provider);
  const lead = connecting
    ? `<h1 data-part="page-title">Sign in to connect ${escapeHtml(connecting)}</h1>
<p class="lx-muted">${escapeHtml(connecting)} wants to use your Lexicommons account. Sign in first; then you choose whether to let it.</p>`
    : `<h1 data-part="page-title">Learn a language for free.</h1>`;
  const notices = [
    deleted ? notice("right", "Your account has been deleted.") : "",
    signedOut ? notice("right", "You've signed out.") : "",
    paused ? pausedNotice() : "",
    error && !(paused && options.error === "paused") ? notice(options.error === "paused" ? "info" : "wrong", error) : "",
  ].join("");
  // Create account right under the field (its lines under it): iOS centers a focused field in what the keyboard leaves (287 px on an SE), so
  // the button clears the keys and Safari's pill (just below that) only with its foot within half of that of the field's middle (measured on
  // iOS 26.4 simulators, 7 Nov: with the lines between, 162 px on an SE, under the pill; right under, 90, 54 px to spare).
  const createForm = () => `<form class="lx-signin-form" id="register">
<label data-part="field"><span>Your name</span>
<input data-part="text-field" name="name" maxlength="40" autocomplete="nickname" required aria-describedby="name-line">
</label>
<button data-part="button" data-variant="white" data-size="lg" data-block type="submit">Create account with a passkey</button>
<p class="lx-small lx-muted" id="name-line">${named} A passkey is your device's own sign-in: Face ID, Touch ID or its screen lock.</p>
${AGREE}
</form>`;
  // Someone new: their account first (Google, GitHub or Apple make one as well as sign in), the passkey's form open, signing in under it. They
  // come from the public page's Start learning, which has just said what Lexicommons is: this page leads with what to do, under a smaller
  // drop (signin.css, data-mode="new"), so the name field and Create account sit high, clear of the keyboard as the name is typed.
  if (newcomer) {
    return lxLayout(
      "Create your account · Lexicommons",
      `${notices}
<section class="lx-signin-ways" aria-labelledby="new-title" id="auth" data-next="${escapeHtml(next)}" data-mode="new">
<h1 data-part="page-title" id="new-title">Create your account</h1>
${providers.google ? providerForm("google", next, "signin") : ""}
${providers.github ? providerForm("github", next, "signin") : ""}
${providers.apple ? providerForm("apple", next, "signin") : ""}
${createForm()}
${notice("wrong", "", { id: "auth-error", hidden: true })}
<p class="lx-signin-already">Already have an account? <button type="button" class="lx-signin-plain" id="signin">Sign in with a passkey</button></p>
<p class="lx-signin-try">Not ready for an account? <a class="lx-signin-plain" href="/try/">Try two lessons first</a></p>
</section>
${computerNote()}
${options.recovery ? `<p class="lx-signin-note lx-small" id="recover-link"><a href="/login/recover?next=${encodeURIComponent(next)}">Lost your passkey? Get back in with your email</a></p>` : ""}
`,
      { scripts: ["/js/login.js"], mode: "new" },
    );
  }
  return lxLayout(
    connecting ? `Sign in to connect ${connecting} · Lexicommons` : "Sign in · Lexicommons",
    `<div class="lx-signin-lead">
${lead}
</div>
${notices}
<section class="lx-signin-ways" aria-label="${paused ? "Sign in" : "Sign in or create an account"}" id="auth" data-next="${escapeHtml(next)}"${paused ? ' data-mode="paused"' : ""}>
<h2 class="lx-signin-ways-title">${paused ? "Sign in" : "Sign in or create an account"}</h2>
${providers.google ? providerForm("google", next, "signin") : ""}
${providers.github ? providerForm("github", next, "signin") : ""}
${providers.apple ? providerForm("apple", next, "signin") : ""}
${signInButtonMarkup("passkey", { type: "button", attrs: { id: "signin" } })}
${notice("wrong", "", { id: "auth-error", hidden: true })}
</section>
${connecting ? "" : computerNote()}
${options.recovery ? `<p class="lx-signin-note lx-small" id="recover-link"><a href="/login/recover?next=${encodeURIComponent(next)}">Lost your passkey? Get back in with your email</a></p>` : ""}
${
  paused
    ? ""
    : `<details class="lx-signin-new" id="new">
<summary>Create an account with a passkey${iconMarkup("chevron")}</summary>
${createForm()}
</details>`
}
`,
    { scripts: ["/js/login.js"] },
  );
}

/**
 * Getting back in with the account's email (account-email.ts; login-recover.js): the address, then the 6-digit code sent to it (typed here:
 * no link is ever sent), then a passkey for this device, or Not now.
 */
export function recoverPage(next: string): string {
  return lxLayout(
    "Get back in · Lexicommons",
    `<div class="lx-signin-lead">
<h1 data-part="page-title">Get back in with your email</h1>
<p class="lx-muted">If your account has an email, a 6-digit code goes to it. Type it here: no link to click.</p>
</div>
<section class="lx-signin-ways" aria-label="Get back in" id="recover" data-next="${escapeHtml(next)}">
<form class="lx-signin-form" id="recover-email">
<label data-part="field"><span>Your account's email</span>
<input data-part="text-field" type="email" name="email" maxlength="254" autocomplete="email" inputmode="email" required>
</label>
<button data-part="button" data-variant="white" data-size="lg" data-block type="submit">Send a code</button>
</form>
<form class="lx-signin-form" id="recover-code" hidden>
<p class="lx-small lx-muted" id="recover-sent">If that email is on an account, its code is on the way. It works for 15 minutes.</p>
<label data-part="field"><span>The code</span>
<input data-part="text-field" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required>
</label>
<button data-part="button" data-variant="white" data-size="lg" data-block type="submit">Get back in</button>
<button data-part="button" data-variant="fade" data-size="sm" type="button" id="recover-again">Use another email</button>
</form>
<div class="lx-signin-form" id="recover-passkey" hidden>
${notice("right", "You're back in.")}
<p class="lx-muted">Add a passkey on this device, so next time you sign in with it.</p>
${signInButtonMarkup("passkey", { type: "button", label: "Add a passkey on this device", attrs: { id: "recover-add" } })}
<a data-part="button" data-variant="fade" data-size="sm" id="recover-skip" href="${escapeHtml(next)}">Not now</a>
</div>
${notice("wrong", "", { id: "auth-error", hidden: true })}
</section>
<p class="lx-signin-note lx-small"><a href="/login?next=${encodeURIComponent(next)}">Back to signing in</a></p>`,
    { scripts: ["/js/login-recover.js"] },
  );
}

export type PendingView = {
  providers: Provider[];
  name: string;
  labels: { provider: Provider; label: string | null }[];
  next: string;
};

/** The create step: a Google, GitHub or Apple account nobody uses here yet. ready: which ways this site can use now. */
export function newAccountPage(
  view: PendingView,
  { error, provider, ready, sharingOpen = false, paused = false }: { error: string | null; provider?: Provider; ready: Record<Provider, boolean>; sharingOpen?: boolean; paused?: boolean },
): string {
  const names = view.providers.map((p) => PROVIDER_NAMES[p]);
  const which = view.labels
    .map(({ provider: p, label }) => `<li><span class="lx-sign-in-mark">${SIGN_IN_WAYS[p].mark}</span><span>${escapeHtml(PROVIDER_NAMES[p])}${label ? ` <span class="lx-muted">· ${escapeHtml(label)}</span>` : ""}</span></li>`)
    .join("");
  const message = signInErrorText(error, provider);
  const others = (["google", "github", "apple"] as Provider[]).filter((p) => ready[p] && !view.providers.includes(p));
  const joined = names.join(" and ");
  return lxLayout(
    "Create your account · Lexicommons",
    `<div class="lx-signin-lead">
<h1 data-part="page-title">Create your account</h1>
<p class="lx-muted">No Lexicommons account uses ${names.length > 1 ? "these" : "this"} yet:</p>
<ul class="lx-signin-pending">${which}</ul>
</div>
${
  paused
    ? pausedNotice()
    : `${message ? notice(error === "unknown" || error === "paused" ? "info" : "wrong", message) : ""}
<form class="lx-signin-form" method="post" action="/login/new" id="create">
<label data-part="field"><span>Your name</span>
<input data-part="text-field" name="name" maxlength="40" autocomplete="nickname" required value="${escapeHtml(view.name)}">
</label>
<p class="lx-small lx-muted">${nameLine(sharingOpen)} Any name you like.</p>
<button data-part="button" data-variant="white" data-size="lg" data-block type="submit">Create account</button>
${AGREE}
</form>`
}
<section class="lx-signin-ways lx-signin-have" aria-label="Already have an account?" id="auth" data-next="${escapeHtml(view.next)}" data-attach="${escapeHtml(joined)}">
<h2 class="lx-signin-ways-title">Already have an account?</h2>
<p class="lx-small lx-muted">Sign in to it, and ${escapeHtml(joined)} ${names.length > 1 ? "are added as other ways in" : "is added as another way in"}.</p>
${others.map((p) => providerForm(p, view.next, "attach")).join("\n")}
${signInButtonMarkup("passkey", { type: "button", label: "Sign in with a passkey", attrs: { id: "signin" } })}
${notice("wrong", "", { id: "auth-error", hidden: true })}
</section>
<p class="lx-signin-note lx-small"><a href="/login">Start over</a></p>`,
    { scripts: ["/js/login.js"] },
  );
}

export function consentPage(user: { name: string }, consent: ConsentDescription, handle: string, accountMark: string, switchNext: string): string {
  const verified = consent.clientDomain
    ? `${iconMarkup("check")}<span>Verified: it comes from <span class="lx-mono">${escapeHtml(consent.clientDomain)}</span></span>`
    : `${iconMarkup("info")}<span>This app named itself; its name isn't verified. Connect it only if you started this.</span>`;
  const destination = consent.redirectIsLoopback
    ? `an app on this computer (<span class="lx-mono">${escapeHtml(consent.redirectHost)}</span>)`
    : `<span class="lx-mono">${escapeHtml(consent.redirectHost)}</span>`;
  // Exactly what the grant will hold: app.ts grants DEFAULT_SCOPES to a request naming none, so that's what this lists.
  const scopes = consent.scope.length ? consent.scope : DEFAULT_SCOPES;
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join("") || "?";
  return lxLayout(
    `Connect ${consent.clientName} · Lexicommons`,
    `<div class="lx-signin-lead">
<h1 data-part="page-title">Connect ${escapeHtml(consent.clientName)}?</h1>
<p class="lx-muted">${escapeHtml(consent.clientName)} wants to use your Lexicommons account.</p>
</div>
<p class="lx-consent-origin" data-state="${consent.clientDomain ? "verified" : "unverified"}">${verified}</p>
<section data-part="card" class="lx-consent-card">
<h2 class="lx-h3">It will be able to</h2>
<ul class="lx-consent-scopes">${scopes.map((s) => `<li>${iconMarkup("check")}<span>${escapeHtml(SCOPE_WORDS[s] ?? s)}</span></li>`).join("")}</ul>
<p class="lx-small lx-muted">Access goes to ${destination}. Disconnect it any time in Settings → AI.</p>
</section>
<form method="post" action="/authorize" class="lx-consent-actions">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
<input type="hidden" name="account" value="${escapeHtml(accountMark)}">
<button data-part="button" data-variant="white" data-size="lg" data-block type="submit" name="decision" value="approve">Connect</button>
<button data-part="button" data-variant="fade" data-size="lg" data-block type="submit" name="decision" value="deny">Cancel</button>
</form>
<form method="post" action="/logout" class="lx-consent-who">
${hiddenNext(switchNext)}
<span data-part="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
<span class="lx-small"><span class="lx-muted">Signed in as</span> <strong>${escapeHtml(user.name)}</strong></span>
<button data-part="button" data-variant="fade" data-size="sm" type="submit">Not you?</button>
</form>`,
  );
}

export function messagePage(title: string, message: string, status = 400): Response {
  return new Response(
    lxLayout(
      `${title} · Lexicommons`,
      `<div class="lx-signin-lead">
<h1 data-part="page-title">${escapeHtml(title)}</h1>
<p class="lx-muted">${escapeHtml(message)}</p>
</div>
<p><a data-part="button" data-variant="gray" data-size="lg" data-block href="/app/">Back to Lexicommons</a></p>`,
    ),
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export function gatePage(next: string, error?: string): string {
  return layout(
    "Lexicommons",
    `<img class="gate-mark" src="/icons/mark.svg" alt="" aria-hidden="true">
<h1 class="head">Lexicommons</h1>
<p class="muted">Enter the password to continue.</p>
<form method="post" action="/_gate" class="stack">
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <label class="field"><span>Password</span>
    <input type="password" name="password" autocomplete="current-password" required autofocus>
  </label>
  ${error ? `<p class="state negative" role="alert">${escapeHtml(error)}</p>` : ""}
  <button class="button go" type="submit">Continue</button>
</form>`,
  );
}

export function html(body: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(body, { headers });
}

/**
 * Report a bug for someone who isn't signed in (/report, from the sign-in pages' foot): a broken sign-in is just what they'd report. The
 * same report as Settings → Report a bug, in the same words, through the same rules (public/js/report.js, lx/report-form.js); what goes
 * along is filled in by the page and shown before it's sent, and the account is none.
 */
export function reportPage(): string {
  const row = (key: string, along: string, value = "") =>
    `<li data-part="list-row"><span class="lx-row-text"><span class="lx-row-title">${escapeHtml(say(key))}</span></span><span class="lx-row-end lx-row-value" data-along="${along}">${escapeHtml(value)}</span></li>`;
  return lxLayout(
    `${say("settings.report.title")} · Lexicommons`,
    `<div class="lx-signin-lead">
<h1 data-part="page-title">${escapeHtml(say("settings.report.title"))}</h1>
<p class="lx-muted" id="report-lead">${escapeHtml(say("settings.report.signedOutLead"))}</p>
</div>
<section class="lx-signin-ways lx-report" aria-label="${escapeHtml(say("settings.report.title"))}" id="report">
<form class="lx-signin-form" id="report-form" novalidate>
<label data-part="field"><span>${escapeHtml(say("settings.report.what"))}</span>
<textarea data-part="text-field" name="text" rows="6" maxlength="${BUG_LIMITS.text}" placeholder="${escapeHtml(say("settings.report.placeholder"))}" autocapitalize="sentences"></textarea>
</label>
<div class="lx-report-shot" id="report-shot"><button type="button" data-part="button" data-variant="fade" data-size="sm" id="report-add">${iconMarkup("plus")}${escapeHtml(say("settings.report.addScreenshot"))}</button></div>
<input type="file" id="report-file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden>
<p class="lx-small lx-muted lx-report-along">${escapeHtml(say("settings.report.sentAlong"))}</p>
<section class="lx-group lx-report-summary"><ul data-part="list">
${row("settings.report.screen", "screen")}
${row("settings.report.version", "version")}
${row("settings.report.device", "device")}
${row("settings.report.languages", "languages")}
${row("settings.report.account", "account", say("settings.report.accountNone"))}
</ul></section>
<button data-part="button" data-variant="white" data-size="lg" data-block type="submit">${escapeHtml(say("settings.report.send"))}</button>
${notice("right", "", { id: "report-sent", hidden: true })}
${notice("wrong", "", { id: "report-error", hidden: true })}
</form>
</section>`,
    // Its foot leads back to signing in, so nobody is left here: Sign in · Privacy · Terms.
    { scripts: ["/js/report.js"], reportLink: false, signInLink: true },
  );
}

/**
 * An address that isn't there (a typo, a link cut short): the sign-in pages' layout, saying so, with the way on to the home page and to
 * signing in. app.ts serves it with a 404 to a browser asking for a page, never to the API or a file a page asks for.
 */
export function notFoundPage(): string {
  return lxLayout(
    `${say("core.notFound.title")} · Lexicommons`,
    `<div class="lx-signin-lead">
<h1 data-part="page-title">${escapeHtml(say("core.notFound.title"))}</h1>
<p class="lx-muted">${escapeHtml(say("core.notFound.sub"))}</p>
</div>
<section class="lx-signin-ways lx-not-found" aria-label="${escapeHtml(say("core.notFound.title"))}">
<a data-part="button" data-variant="white" data-size="lg" data-block href="/">${escapeHtml(say("core.notFound.home"))}</a>
<a data-part="button" data-size="lg" data-block href="/login">${escapeHtml(say("core.notFound.signIn"))}</a>
</section>`,
  );
}

