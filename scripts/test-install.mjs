import { readFileSync } from "node:fs";
// Add to Home Screen (shell/install-guide.js), case by case: which device and browser a real user agent is (iPhone and
// iPad Safari before and after iOS 26, an iPad asking for desktop pages, Chrome, Firefox and Edge on iPhone, apps'
// own browsers, Android's browsers and its WebView, Mac Safari, Chrome, Edge and Firefox on a computer), an installed
// app, and every device's steps naming only buttons it can draw. Pure, so it runs in Node:
// `node scripts/test-install.mjs` (exit 0 = pass).

import { BUTTONS, PLATFORMS, detect, platformById } from "../public/js/shell/install-guide.js";
import { KEPT_WITH_ACCOUNT, keepKind, keepWords } from "../public/js/shell/keep-rules.js";
import { ICON_NAMES } from "../public/js/lx/icons.js";

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

const UA = {
  iphoneSafari26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphoneSafari27: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1",
  iphoneSafari18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  ipadSafari: "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1",
  iphoneFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15",
  iphoneEdge: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 EdgiOS/141.0.3537.71 Mobile/15E148 Safari/605.1.15",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 400.0.0.27.79 (iPhone16,2; iOS 18_6; en_US; en; scale=3.00; 1290x2796; 812345678)",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/FBIOS;FBAV/500.0.0.31.104;FBBV/700000000;FBDV/iPhone16,2;FBMD/iPhone;FBSN/iOS;FBSV/18.6]",
  googleApp: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/385.0.786563834 Mobile/15E148 Safari/604.1",
  tiktok: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_41.2.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US",
  x: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/11.20",
  // An app's own web view on an iPhone with nothing of its own in what it says (YouTube's and Discord's in-app pages, a mail app's): no "Safari/".
  iphoneWebView: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  discordAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 Discord-Android/250013",
  androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0",
  androidEdge: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0",
  headless: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
};

test("iPhone and iPad Safari: iOS 26 and later (Page Menu, then Share), iOS 18 and earlier (Share in the toolbar)", () => {
  eq(detect({ ua: UA.iphoneSafari26 }), { id: "ios-safari", installed: false, mobile: true });
  eq(detect({ ua: UA.iphoneSafari27 }).id, "ios-safari", "iOS 27: its Safari version, though the OS version says 18_6");
  eq(detect({ ua: UA.iphoneSafari18 }).id, "ios-safari-18");
  eq(detect({ ua: UA.ipadSafari }).id, "ios-safari");
});

test("an iPad asking for desktop pages reads as a Mac with a touch screen: Safari on iPad; the same without touch is a Mac", () => {
  eq(detect({ ua: UA.ipadDesktop, maxTouchPoints: 5 }), { id: "ios-safari", installed: false, mobile: true });
  eq(detect({ ua: UA.macSafari, maxTouchPoints: 0 }), { id: "mac-safari", installed: false, mobile: false });
});

test("other browsers on iPhone: Chrome has its own steps; Firefox and Edge get the general ones (their own version tokens, not Safari's)", () => {
  eq(detect({ ua: UA.iphoneChrome }).id, "ios-chrome");
  eq(detect({ ua: UA.iphoneFirefox }).id, "ios-other");
  eq(detect({ ua: UA.iphoneEdge }).id, "ios-other", "Edge says Version/26.0 too: it's still Edge");
});

test("apps' own browsers (Instagram, Facebook, the Google app, Android's WebView): open it in the browser first", () => {
  for (const name of ["instagram", "facebook", "googleApp", "androidWebView"]) eq(detect({ ua: UA[name] }).id, "in-app", name);
});

test("more apps' own browsers: TikTok, X, an iPhone app's plain web view (YouTube's, Discord's), Discord on Android", () => {
  for (const name of ["tiktok", "x", "iphoneWebView", "discordAndroid"]) eq(detect({ ua: UA[name] }).id, "in-app", name);
  // What can't be told: an app that borrows Safari's own view says exactly what Safari says.
  eq(detect({ ua: UA.iphoneSafari26 }).id, "ios-safari", "Safari's own words are Safari, wherever they're said");
  // And an iPad asking for desktop pages (no "Mobile", but "Safari/") is still Safari on an iPad, never an app's view.
  eq(detect({ ua: UA.ipadDesktop, maxTouchPoints: 5 }).id, "ios-safari");
});

test("where progress is kept (shell/keep-rules.js): an iPhone's browser, another app's browser, the Home Screen app opening empty; nowhere else", () => {
  const kind = (name, more = {}, opts) => keepKind(detect({ ua: UA[name], ...more }), opts);
  eq(kind("iphoneSafari26"), "ios-browser");
  eq(kind("iphoneSafari18"), "ios-browser");
  eq(kind("iphoneChrome"), "ios-browser", "Chrome on an iPhone keeps its own, too");
  eq(kind("ipadDesktop", { maxTouchPoints: 5 }), "ios-browser");
  eq(kind("iphoneSafari26", { standalone: true }), "ios-app", "the Home Screen app, nothing studied in it");
  // The Home Screen app says no "Safari/" in what it says of itself, as an app's web view doesn't: standalone tells them apart.
  eq(detect({ ua: UA.iphoneWebView, standalone: true }).id === "in-app", false, "the Home Screen app taken for another app's browser");
  eq(kind("iphoneWebView", { standalone: true }), "ios-app", "the Home Screen app by its own words");
  eq(kind("iphoneSafari26", { standalone: true }, { fresh: false }), null, "the Home Screen app with progress: nothing to say");
  for (const name of ["instagram", "facebook", "tiktok", "x", "iphoneWebView", "discordAndroid", "androidWebView"]) eq(kind(name), "in-app", name);
  // An installed app on Android uses the browser's own storage, and a computer's browser is where it'll stay: nothing said.
  for (const name of ["androidChrome", "samsung", "androidFirefox", "chromeMac", "edgeWindows", "firefoxMac", "macSafari"]) eq(kind(name), null, name);
  eq(kind("androidChrome", { standalone: true }), null);
  // Each one's words: the address to copy for an app's browser, the way to the steps for an iPhone's, neither for the Home Screen app.
  ok(keepWords("in-app", { address: "lexicommons.com" }).copy === "lexicommons.com" && /open lexicommons\.com in Safari/.test(keepWords("in-app", { address: "lexicommons.com" }).text), "an app's browser: the address");
  ok(/Add Lexicommons to your Home Screen before you go on/.test(keepWords("ios-browser").text) && keepWords("ios-browser").how, "an iPhone's browser: add it first");
  ok(/still there, in Safari/.test(keepWords("ios-app").text) && !keepWords("ios-app").how && !keepWords("ios-app").copy, "the Home Screen app: where the lesson is");
  eq(keepWords(null), null);
});

test("the keep-here lines go the day the account keeps its own copy of your progress (a route under /api/account/sync)", () => {
  const server = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const kept = /["'`]\/api\/account\/sync/.test(server);
  const says = keepKind(detect({ ua: UA.iphoneSafari26 })) !== null;
  ok(!(kept && says), "the server keeps an account's progress now (/api/account/sync), and keep-rules.js still tells learners their progress stays in the browser: set KEPT_WITH_ACCOUNT and take the notes out");
  // The control: the same rule on a server that has the route, with the notes as they are today.
  ok(/["'`]\/api\/account\/sync/.test(`app.get("/api/account/sync/list", …)`) && (KEPT_WITH_ACCOUNT || says), "control: the route's shape is found, and today the notes still say something");
  return kept ? "kept with the account: nothing said" : "not kept with the account yet: the notes stand";
});

test("Android: Chrome, Samsung Internet, Firefox; Edge and others get the general steps", () => {
  eq(detect({ ua: UA.androidChrome }), { id: "android-chrome", installed: false, mobile: true });
  eq(detect({ ua: UA.samsung }).id, "android-samsung", "Samsung says Chrome/ too");
  eq(detect({ ua: UA.androidFirefox }).id, "android-firefox");
  eq(detect({ ua: UA.androidEdge }).id, "android-other");
});

test("computers: Chrome, Edge (says Chrome/ too), Firefox (can't install), Mac Safari", () => {
  eq(detect({ ua: UA.chromeMac }), { id: "desktop-chrome", installed: false, mobile: false });
  eq(detect({ ua: UA.headless }).id, "desktop-chrome");
  eq(detect({ ua: UA.edgeWindows }).id, "desktop-edge");
  eq(detect({ ua: UA.firefoxMac }).id, "desktop-firefox");
  eq(platformById("desktop-firefox").can, false);
});

test("already installed (opened from the Home Screen): says so, whatever the browser", () => {
  eq(detect({ ua: UA.iphoneSafari26, standalone: true }).installed, true);
  eq(detect({ ua: UA.androidChrome, standalone: true }).installed, true);
});

test("an unknown agent has no steps of its own (the page lists every device)", () => {
  eq(detect({ ua: "curl/8.7.1" }), { id: null, installed: false, mobile: false });
  eq(detect({}).id, null);
});

test("every device's steps: unique ids, a title, and only buttons drawn with an icon that exists, each with a name", () => {
  const ids = PLATFORMS.map((p) => p.id);
  eq(new Set(ids).size, ids.length, "unique");
  for (const p of PLATFORMS) {
    ok(p.title && p.device && Array.isArray(p.steps) && p.steps.length >= 1, `${p.id}: shape`);
    for (const step of p.steps) {
      ok(Array.isArray(step) && step.length, `${p.id}: a step`);
      for (const piece of step) {
        if (typeof piece === "string") continue;
        ok(Object.hasOwn(BUTTONS, piece.key) && ICON_NAMES.includes(BUTTONS[piece.key]), `${p.id}: button ${piece.key}`);
        ok(typeof piece.label === "string" && piece.label.length > 1, `${p.id}: a button with no name`);
      }
    }
  }
  // Every detected id has steps.
  for (const ua of Object.values(UA)) {
    const id = detect({ ua, maxTouchPoints: 0 }).id;
    ok(id === null || platformById(id), `no steps for ${id}`);
  }
});

test("Safari on iOS 26 and later names the Page Menu, then Share, and Open as Web App (Apple's own steps)", () => {
  const text = (p) => p.steps.map((s) => s.map((x) => (typeof x === "string" ? x : `[${x.label}]`)).join("")).join(" | ");
  const ios = text(platformById("ios-safari"));
  ok(/\[Page Menu\].*\[Share\]/.test(ios) && /Open as Web App/.test(ios) && /Edit Actions/.test(ios), ios);
  ok(/\[Share\]/.test(text(platformById("ios-safari-18"))) && !/Page Menu/.test(text(platformById("ios-safari-18"))), "iOS 18");
  ok(/File, then Add to Dock/.test(text(platformById("mac-safari"))), "Mac");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
