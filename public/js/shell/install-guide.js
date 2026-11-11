// Putting Lexicommons on your Home Screen (or in your Dock, or your apps): which device and browser this is, and the
// steps for each, from each maker's own help (sources below). Pure: no DOM, so scripts/test-install.mjs runs it in Node.
// A step is a list of pieces: text, or { key, label } for a button to tap, drawn as its glyph with its name (the
// glyph alone never carries the meaning). shell/settings-install.js draws them.
//
// Sources (read 1 Nov 2026):
//   Safari on iPhone and iPad, iOS 26 and 27: support.apple.com/guide/iphone/iphea86e5236 (Page Menu, then Share; the
//     Share button itself with tabs at the bottom or top; Edit Actions if Add to Home Screen is missing; Open as Web App)
//   Safari on Mac (macOS Sonoma and later): support.apple.com/104996 (File → Add to Dock, or Share → Add to Dock)
//   Chrome on iPhone, Android and computers: support.google.com/chrome/answer/9658361 (per platform)
//   Edge on computers: support.microsoft.com/edge "Install, manage, or uninstall apps in Microsoft Edge"
//   Samsung Internet: samsunginternet.github.io/docs/homescreen (Add page to → Home screen; the install icon)
//   Firefox for Android: support.mozilla.org/questions/1362939 (Install, for sites that are web apps)

// This site's address, as a person types it (a test has no location).
const HOST = globalThis.location?.host ?? "lexicommons.com";
/** The glyphs a step can point at: an icon name (lx/icons.js) for each. */
export const BUTTONS = {
  share: "share", // Safari's and Chrome's Share on iPhone: a square with an arrow up
  pageMenu: "more", // Safari's Page Menu (•••), iOS 26 and later
  dotsMenu: "more-v", // Chrome's and Firefox's menu on Android (⋮)
  lineMenu: "menu", // Samsung Internet's menu (≡)
  addHome: "plus-square", // Add to Home Screen in the share sheet
  install: "download", // an Install button or icon
  dock: "plus-square", // Add to Dock
};

const tap = (key, label) => ({ key, label });

/**
 * Every device and browser we have steps for, in the order "Find your device's steps" lists them:
 * { id, device, browser, title (how the page names it), steps: [[piece]], note?, can (whether it can install at all) }.
 */
export const PLATFORMS = [
  {
    id: "ios-safari",
    device: "iPhone or iPad",
    browser: "Safari",
    title: "On iPhone or iPad, in Safari",
    can: true,
    steps: [
      ["Tap ", tap("pageMenu", "Page Menu"), " beside the address, then ", tap("share", "Share"), ". With your tabs at the bottom or top, tap ", tap("share", "Share"), " right away."],
      ["Scroll down and tap ", tap("addHome", "Add to Home Screen"), ". Not there? Tap Edit Actions at the bottom of the list and add it."],
      ["Turn on Open as Web App, then tap Add."],
      ["Open Lexicommons from your Home Screen."],
    ],
  },
  {
    id: "ios-safari-18",
    device: "iPhone or iPad, iOS 18 or earlier",
    browser: "Safari",
    title: "On iPhone or iPad (iOS 18 or earlier), in Safari",
    can: true,
    steps: [
      ["Tap ", tap("share", "Share"), " in Safari's toolbar."],
      ["Scroll down and tap ", tap("addHome", "Add to Home Screen"), ". Not there? Tap Edit Actions at the bottom of the list and add it."],
      ["Tap Add."],
      ["Open Lexicommons from your Home Screen."],
    ],
  },
  {
    id: "ios-chrome",
    device: "iPhone or iPad",
    browser: "Chrome",
    title: "On iPhone or iPad, in Chrome",
    can: true,
    steps: [
      ["Tap ", tap("share", "Share"), " on the right of the address bar."],
      ["Tap ", tap("addHome", "Add to Home Screen"), "."],
      ["Check the name and tap Add."],
      ["Open Lexicommons from your Home Screen."],
    ],
  },
  {
    id: "ios-other",
    device: "iPhone or iPad",
    browser: "another browser",
    title: "On iPhone or iPad, in another browser",
    can: true,
    steps: [
      ["Tap your browser's ", tap("share", "Share"), " button."],
      ["Tap ", tap("addHome", "Add to Home Screen"), " and then Add."],
      [`Not there? Open ${HOST} in Safari and add it from there.`],
    ],
  },
  {
    id: "android-chrome",
    device: "Android",
    browser: "Chrome",
    title: "On Android, in Chrome",
    can: true,
    steps: [
      ["Tap ", tap("dotsMenu", "More"), " on the right of the address bar."],
      ["Tap ", tap("addHome", "Add to home screen"), ", then ", tap("install", "Install"), "."],
      ["Open Lexicommons from your home screen or your apps."],
    ],
  },
  {
    id: "android-samsung",
    device: "Android",
    browser: "Samsung Internet",
    title: "On Android, in Samsung Internet",
    can: true,
    steps: [
      ["Tap ", tap("install", "Install"), " in the address bar if it's there. If not, tap ", tap("lineMenu", "Menu"), " at the bottom."],
      ["Tap Add page to, then Home screen."],
      ["Open Lexicommons from your home screen."],
    ],
  },
  {
    id: "android-firefox",
    device: "Android",
    browser: "Firefox",
    title: "On Android, in Firefox",
    can: true,
    steps: [
      ["Tap ", tap("dotsMenu", "More"), " beside the address bar."],
      ["Tap ", tap("install", "Install"), " (or Add to Home screen), then confirm."],
      ["Open Lexicommons from your home screen."],
    ],
  },
  {
    id: "android-other",
    device: "Android",
    browser: "another browser",
    title: "On Android, in another browser",
    can: true,
    steps: [
      ["Open your browser's menu."],
      ["Tap Install app, or Add to home screen."],
      [`Not there? Open ${HOST} in Chrome and install it from there.`],
    ],
  },
  {
    id: "mac-safari",
    device: "Mac",
    browser: "Safari",
    title: "On a Mac, in Safari",
    can: true,
    steps: [
      ["In the menu bar, choose File, then Add to Dock. Or click ", tap("share", "Share"), " and choose Add to Dock."],
      ["Click Add."],
      ["Open Lexicommons from your Dock, or Spotlight."],
    ],
    note: "Needs macOS Sonoma or later.",
  },
  {
    id: "desktop-chrome",
    device: "computer",
    browser: "Chrome",
    title: "On a computer, in Chrome",
    can: true,
    steps: [
      ["Click ", tap("install", "Install"), " at the right of the address bar. Not there? Open ", tap("dotsMenu", "More"), ", then Cast, save, and share, then Install page as app."],
      ["Click Install."],
    ],
  },
  {
    id: "desktop-edge",
    device: "computer",
    browser: "Edge",
    title: "On a computer, in Edge",
    can: true,
    steps: [
      ["Open ", tap("pageMenu", "Settings and more"), ", then Apps (in some versions, More tools, then Apps)."],
      ["Choose Install this site as an app, then Install."],
    ],
  },
  {
    id: "desktop-firefox",
    device: "computer",
    browser: "Firefox",
    title: "On a computer, in Firefox",
    can: false,
    steps: [[`Firefox on a computer can't install web apps yet. Open ${HOST} in Chrome, Edge or Safari to install it, or keep it as a pinned tab.`]],
  },
  {
    id: "in-app",
    device: "an app's own browser",
    browser: "",
    title: "In another app's browser",
    can: false,
    steps: [
      ["This page is open inside another app, which can't add it to your Home Screen."],
      ["Open the app's menu (often ", tap("pageMenu", "More"), ") and choose Open in browser, or Open in Safari or Chrome."],
      ["Then follow the steps there."],
    ],
  },
];

export const platformById = (id) => PLATFORMS.find((p) => p.id === id) ?? null;

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp|Twitter|WhatsApp|MicroMessenger|Pinterest|GSA\/|; wv\)/;

/**
 * Which device and browser this is. { ua, maxTouchPoints, standalone (the app is already open from the Home Screen or
 * as an installed app) } → { id (a PLATFORMS id, or null when unknown), installed, mobile }.
 * iPadOS asks for desktop pages as a Mac does: a "Macintosh" with a touch screen is an iPad.
 */
export function detect({ ua = "", maxTouchPoints = 0, standalone = false } = {}) {
  const ipad = /Macintosh/.test(ua) && maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || ipad;
  const android = /Android/.test(ua);
  const mobile = ios || android;
  const out = (id) => ({ id, installed: Boolean(standalone), mobile });
  if (IN_APP.test(ua)) return out("in-app");
  if (ios) {
    if (/CriOS\//.test(ua)) return out("ios-chrome");
    if (/FxiOS\/|EdgiOS\/|OPiOS\/|OPT\/|DuckDuckGo\/|YaBrowser\//.test(ua)) return out("ios-other");
    // Safari: its own version (iOS 26 froze the OS version in the user agent at 18_6, so read Safari's).
    const version = Number(/Version\/(\d+)/.exec(ua)?.[1]);
    if (/Safari\//.test(ua) && Number.isFinite(version)) return out(version >= 26 ? "ios-safari" : "ios-safari-18");
    return out("ios-other");
  }
  if (android) {
    if (/SamsungBrowser\//.test(ua)) return out("android-samsung");
    if (/Firefox\//.test(ua)) return out("android-firefox");
    if (/EdgA\/|OPR\/|YaBrowser\/|UCBrowser\//.test(ua)) return out("android-other");
    if (/Chrome\//.test(ua)) return out("android-chrome");
    return out("android-other");
  }
  if (/Edg\//.test(ua)) return out("desktop-edge");
  if (/Firefox\//.test(ua)) return out("desktop-firefox");
  if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) return out("desktop-chrome");
  if (/Macintosh/.test(ua) && /Version\/\d+.*Safari\//.test(ua)) return out("mac-safari");
  return out(null);
}
